using Amazon.CDK;
using Amazon.CDK.AWS.S3;
using Constructs;

namespace MeloMeloCdk;

public class StorageStack : BaseStack
{
    public IBucket DropboxBucket { get; }
    public IBucket PrivateReadonlyBucket { get; }
    public IBucket PublicReadonlyBucket { get; }

    public StorageStack(Construct scope, string id, IStackProps props = null) : base(scope, id, props)
    {
        // Destroy-policy buckets must empty themselves on delete or `cdk destroy` fails
        // once tests/dev uploads have written objects (cdk.json autoDeleteObjects)
        var autoDelete = Config.AutoDeleteObjects;

        DropboxBucket = new Bucket(this, "DropboxBucket", new BucketProps
        {
            BucketName = $"melo-melo-dropbox-bucket-{Env}",
            PublicReadAccess = false,
            BlockPublicAccess = BlockPublicAccess.BLOCK_ALL,
            RemovalPolicy = DeletionPolicy,
            AutoDeleteObjects = autoDelete,
            LifecycleRules =
            [
                new LifecycleRule
                {
                    Expiration = Duration.Days(1)
                }
            ],
            // The web app PUTs uploads straight to presigned URLs, which the browser preflights.
            // CORS isn't the access control here (the presigned signature is), so dev allows
            // any origin (localhost dev server + the dev CloudFront domain, which this stack can't
            // reference without a cycle); prod is pinned to the app's domain (cdk.json uploadCorsOrigins).
            Cors =
            [
                new CorsRule
                {
                    AllowedMethods = [HttpMethods.PUT],
                    AllowedOrigins = Config.UploadCorsOrigins,
                    AllowedHeaders = ["*"],
                    MaxAge = 3000,
                }
            ]
        });

        PrivateReadonlyBucket = new Bucket(this, "PrivateReadonlyBucket", new BucketProps
        {
            BucketName = $"melo-melo-private-readonly-bucket-{Env}",
            PublicReadAccess = false,
            BlockPublicAccess = BlockPublicAccess.BLOCK_ALL,
            RemovalPolicy = DeletionPolicy,
            AutoDeleteObjects = autoDelete,
        });

        PublicReadonlyBucket = new Bucket(this, "PublicReadonlyBucket", new BucketProps
        {
            BucketName = $"melo-melo-public-readonly-bucket-{Env}",
            PublicReadAccess = true,
            BlockPublicAccess = BlockPublicAccess.BLOCK_ACLS_ONLY,
            RemovalPolicy = DeletionPolicy,
            AutoDeleteObjects = autoDelete,
        });
    }
}