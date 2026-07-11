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
        // Non-prod buckets must empty themselves on delete or `cdk destroy` fails
        // once tests/dev uploads have written objects
        var autoDelete = DeletionPolicy == RemovalPolicy.DESTROY;

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