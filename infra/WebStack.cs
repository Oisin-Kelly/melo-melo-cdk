using Amazon.CDK;
using Amazon.CDK.AWS.CertificateManager;
using Amazon.CDK.AWS.CloudFront;
using Amazon.CDK.AWS.CloudFront.Origins;
using Amazon.CDK.AWS.Route53;
using Amazon.CDK.AWS.Route53.Targets;
using Amazon.CDK.AWS.S3;
using Amazon.CDK.AWS.S3.Deployment;
using Constructs;

namespace MeloMeloCdk;

// Serves the React SPA in web/ — private bucket behind CloudFront (OAC). Deploy via
// scripts/deploy-web.sh, which builds web/dist against the deployed backend's outputs first.
public class WebStack : BaseStack
{
    // Prod-only custom domain. Registrar is Namecheap, but DNS is delegated to this
    // Route53 hosted zone (NS records already live) — that's all CDK needs to know.
    private const string ProdDomainName = "melomelo.app";
    private const string ProdHostedZoneId = "Z0203469J8GFSMPC40EQ";

    public WebStack(Construct scope, string id, IStackProps props = null) : base(scope, id, props)
    {
        var isProd = Env == "prod";
        var autoDelete = DeletionPolicy == RemovalPolicy.DESTROY;

        var bucket = new Bucket(this, "WebBucket", new BucketProps
        {
            BucketName = $"melo-melo-web-bucket-{Env}",
            PublicReadAccess = false,
            BlockPublicAccess = BlockPublicAccess.BLOCK_ALL,
            RemovalPolicy = DeletionPolicy,
            AutoDeleteObjects = autoDelete,
        });

        // CloudFront requires the cert in us-east-1 regardless of which region this stack
        // deploys to — request/validate it there once via the ACM console, then set the ARN.
        ICertificate certificate = null;
        if (isProd)
        {
            var certificateArn = System.Environment.GetEnvironmentVariable("WEB_CERTIFICATE_ARN")
                ?? throw new System.InvalidOperationException(
                    "WEB_CERTIFICATE_ARN must be set for prod — request an ACM cert for " +
                    $"{ProdDomainName} in us-east-1, validate it via DNS, then pass its ARN.");
            certificate = Certificate.FromCertificateArn(this, "WebCertificate", certificateArn);
        }

        var distribution = new Distribution(this, "WebDistribution", new DistributionProps
        {
            DefaultBehavior = new BehaviorOptions
            {
                Origin = S3BucketOrigin.WithOriginAccessControl(bucket),
                ViewerProtocolPolicy = ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                CachePolicy = CachePolicy.CACHING_OPTIMIZED,
                Compress = true,
            },
            DefaultRootObject = "index.html",
            // SPA fallback: deep links like /library miss the bucket (S3 returns 403
            // for OAC-denied unknown keys) — serve the app and let the router handle it
            ErrorResponses =
            [
                new ErrorResponse
                {
                    HttpStatus = 403,
                    ResponseHttpStatus = 200,
                    ResponsePagePath = "/index.html",
                    Ttl = Duration.Seconds(0),
                },
                new ErrorResponse
                {
                    HttpStatus = 404,
                    ResponseHttpStatus = 200,
                    ResponsePagePath = "/index.html",
                    Ttl = Duration.Seconds(0),
                },
            ],
            PriceClass = PriceClass.PRICE_CLASS_100,
            DomainNames = isProd ? [ProdDomainName] : null,
            Certificate = certificate,
        });

        // Hashed assets are immutable — cache forever. index.html is the deploy pointer —
        // never cache, and invalidate CloudFront so new deploys go live immediately.
        // Both Prune=false: with Exclude-based splits, pruning would delete the other
        // deployment's files.
        new BucketDeployment(this, "DeployAssets", new BucketDeploymentProps
        {
            Sources = [Source.Asset("web/dist")],
            DestinationBucket = bucket,
            Exclude = ["index.html"],
            CacheControl = [CacheControl.MaxAge(Duration.Days(365)), CacheControl.Immutable()],
            Prune = false,
        });

        new BucketDeployment(this, "DeployIndex", new BucketDeploymentProps
        {
            Sources = [Source.Asset("web/dist")],
            DestinationBucket = bucket,
            Exclude = ["*"],
            Include = ["index.html"],
            CacheControl = [CacheControl.NoCache()],
            Distribution = distribution,
            DistributionPaths = ["/*"],
            Prune = false,
        });

        if (isProd)
        {
            var hostedZone = HostedZone.FromHostedZoneAttributes(this, "HostedZone", new HostedZoneAttributes
            {
                HostedZoneId = ProdHostedZoneId,
                ZoneName = ProdDomainName,
            });

            new ARecord(this, "WebAliasRecord", new ARecordProps
            {
                Zone = hostedZone,
                RecordName = ProdDomainName,
                Target = RecordTarget.FromAlias(new CloudFrontTarget(distribution)),
            });
        }

        new CfnOutput(this, "WebUrl", new CfnOutputProps
        {
            Value = isProd ? $"https://{ProdDomainName}" : $"https://{distribution.DistributionDomainName}"
        });
    }
}
