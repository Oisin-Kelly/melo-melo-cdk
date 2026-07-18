namespace Adapters.Repositories;

internal static class MembershipRank
{
    public const int Gap = 10;

    private const string Prefix = "ORDER#";

    public static string ToSortKey(int rank) => $"{Prefix}{rank:D7}";

    public static int FromSortKey(string gsi1Sk) => int.Parse(gsi1Sk[Prefix.Length..]);
}
