using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Services;

namespace Adapters.Repositories;

// Readable-URL slug records, shared by the track/album/playlist repositories (each owns its meta
// item's `slug` attribute; this owns the USER#{owner} / SLUG#{KIND}#{slug} → targetId records).
// A slug record is never moved or rewritten: changing an item's URL adds a new record and repoints
// meta.slug, so the old record keeps resolving as a redirect until the item is deleted.
internal static class SlugRecords
{
    // Writes tried before giving up. Each lost race moves on to the next candidate, so this only
    // runs out if this many requests from one owner claim the same name at the same moment.
    private const int MaxClaimAttempts = 25;

    public const string TakenMessage = "That URL is already used. Try another.";

    public static (string Pk, string Sk) Key(string owner, string kind, string slug) =>
        ($"USER#{owner}", $"SLUG#{kind}#{slug}");

    // Claims the first free slug for `title` (base, base-2, …) and returns it. Idempotent per target:
    // if this target already holds a candidate (a retried upload), that one is reused. Run before the
    // meta item is written (meta last, as the authoritative record); an orphaned claim from a failed
    // create only holds a name — it resolves to nothing.
    //
    // Concurrency: the guarded write is what makes a slug unique — of two requests writing the same
    // candidate, DynamoDB lets exactly one through. A request that loses moves straight on to the
    // next candidate (rather than re-reading and going for the same one as everyone else), so N
    // simultaneous same-name creates settle as base, base-2 … base-N in one pass.
    public static async Task<string> ClaimAsync(IDynamoDBService db, string owner, string kind,
        string targetId, string title)
    {
        var baseSlug = Slugs.FromTitle(title, kind);

        var existing = await db.QueryAsync<SlugDataModel>(
            $"USER#{owner}", $"SLUG#{kind}#{baseSlug}", QueryOperator.BeginsWith);

        var own = existing.FirstOrDefault(r => r.TargetId == targetId && IsCandidateOf(r.Slug, baseSlug));
        if (own is not null)
            return own.Slug;

        var taken = existing.Select(r => r.Slug).ToHashSet();
        var candidates = Enumerable.Range(1, int.MaxValue)
            .Select(n => Slugs.Candidate(baseSlug, n))
            .Where(c => !taken.Contains(c) && !Slugs.IsReserved(c, kind));

        foreach (var slug in candidates.Take(MaxClaimAttempts))
        {
            if (await db.TryExecuteTransactWriteAsync(BuildClaim(db, owner, kind, targetId, slug)))
                return slug;
            // Taken between the read and the write by a concurrent request: try the next one
        }

        throw new InvalidOperationException($"Could not claim a slug for {kind} {targetId}");
    }

    // A guarded put of one slug record: succeeds if the slug is free or already this target's
    public static ITransactWrite BuildClaim(IDynamoDBService db, string owner, string kind, string targetId,
        string slug)
    {
        var (pk, sk) = Key(owner, kind, slug);
        var part = db.CreateTransactionPart<SlugDataModel>();
        db.AddConditionalSave(part, new SlugDataModel
        {
            Pk = pk,
            Sk = sk,
            TargetId = targetId,
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        }, ConditionExpressions.ItemNotExistsOrTargetIs(targetId));
        return part;
    }

    public static Task<SlugDataModel?> GetAsync(IDynamoDBService db, string owner, string kind, string slug)
    {
        var (pk, sk) = Key(owner, kind, slug);
        return db.GetFromDynamoAsync<SlugDataModel>(pk, sk);
    }

    // Every slug record (current + redirects) pointing at `targetId`. Scans only the owner's slugs
    // of this kind — small items, bounded by how many tracks/albums/playlists one person has.
    public static async Task DeleteForTargetAsync(IDynamoDBService db, string owner, string kind, string targetId)
    {
        var records = await db.QueryAsync<SlugDataModel>($"USER#{owner}", $"SLUG#{kind}#", QueryOperator.BeginsWith);
        var mine = records.Where(r => r.TargetId == targetId).ToList();
        if (mine.Count == 0)
            return;

        var batch = db.CreateBatchWritePart<SlugDataModel>();
        foreach (var record in mine)
            batch.AddDeleteKey(record.Pk, record.Sk);
        await db.ExecuteBatchWriteAsync(batch);
    }

    // "my-song" and "my-song-3" are candidates of "my-song"; "my-songs" and "my-song-remix" are not
    private static bool IsCandidateOf(string slug, string baseSlug) =>
        slug == baseSlug ||
        (slug.StartsWith(baseSlug + "-") && int.TryParse(slug[(baseSlug.Length + 1)..], out var n) && n >= 2);
}
