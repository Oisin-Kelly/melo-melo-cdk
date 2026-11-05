using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.CDK;
using Constructs;

namespace MeloMeloCdk;

// Per-environment settings, from cdk.json's "environments" context block — one place for
// everything that differs between dev and prod, instead of `Env == "prod"` checks in each
// stack. Pick the environment with ENVIRONMENT=prod or `cdk … -c env=prod` (default dev).
// An environment missing from cdk.json fails the synth: a typo must never fall back to
// dev's destroy-on-delete settings.
public sealed record EnvConfig
{
    /// <summary>dev / prod — set from the key it was read under.</summary>
    public string Name { get; init; } = "";
    /// <summary>"retain" or "destroy": what happens to stateful resources when the stack goes.</summary>
    public required string RemovalPolicy { get; init; }
    /// <summary>Buckets empty themselves on delete, so a destroy-policy stack can actually be deleted.</summary>
    public required bool AutoDeleteObjects { get; init; }
    public required bool PointInTimeRecovery { get; init; }
    /// <summary>Origins allowed to PUT staged uploads into the dropbox bucket.</summary>
    public required string[] UploadCorsOrigins { get; init; }
    /// <summary>The web app's custom domain; null → the CloudFront domain.</summary>
    public DomainConfig? Domain { get; init; }
    /// <summary>Cognito's email sender via SES; null → Cognito's built-in sender.</summary>
    public EmailConfig? Email { get; init; }
    public required ThrottleConfig LinkPreviewThrottle { get; init; }

    public RemovalPolicy Removal => RemovalPolicy switch
    {
        "retain" => Amazon.CDK.RemovalPolicy.RETAIN,
        "destroy" => Amazon.CDK.RemovalPolicy.DESTROY,
        _ => throw new InvalidOperationException(
            $"cdk.json environments.{Name}.removalPolicy must be \"retain\" or \"destroy\", got \"{RemovalPolicy}\""),
    };

    public sealed record DomainConfig(string Name, string HostedZoneId);
    public sealed record EmailConfig(string FromEmail, string FromName, string SesRegion, string VerifiedDomain);
    public sealed record ThrottleConfig(int RateLimit, int BurstLimit);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    /// <summary>The environment name: `-c env=…`, else ENVIRONMENT, else dev.</summary>
    public static string ResolveName(Construct scope) =>
        scope.Node.TryGetContext("env") as string
        ?? System.Environment.GetEnvironmentVariable("ENVIRONMENT")
        ?? "dev";

    public static EnvConfig Load(Construct scope)
    {
        var name = ResolveName(scope);
        var all = scope.Node.TryGetContext("environments")
            ?? throw new InvalidOperationException("cdk.json has no \"environments\" context block");

        // Context comes back as plain dictionaries/lists; round-trip through JSON for the typed record
        var environments = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(JsonSerializer.Serialize(all))!;
        if (!environments.TryGetValue(name, out var raw))
            throw new InvalidOperationException(
                $"No \"{name}\" in cdk.json environments (known: {string.Join(", ", environments.Keys)})");

        var config = raw.Deserialize<EnvConfig>(JsonOptions) ?? throw new InvalidOperationException($"environments.{name} is empty");
        config = config with { Name = name };
        _ = config.Removal; // validate now, not mid-synth
        return config;
    }
}
