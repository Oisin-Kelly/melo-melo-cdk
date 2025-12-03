using Amazon.CDK;
using Amazon.CDK.AWS.S3;

namespace MeloMeloCdk;

public partial class MeloMeloCdkStack
{
    private void InitialiseBuckets()
    {
        DropboxBucket = new Bucket(this, "DropboxBucket", new BucketProps
        {
            BucketName = $"melo-melo-dropbox-bucket-{Env}".ToLower(),
            PublicReadAccess = false,
            BlockPublicAccess = BlockPublicAccess.BLOCK_ALL,
            RemovalPolicy = RemovalPolicy.RETAIN,
            LifecycleRules = new ILifecycleRule[]
            {
                new LifecycleRule
                {
                    Expiration = Duration.Days(1)
                }
            }
        });

        PrivateReadonlyBucket = new Bucket(this, "PrivateReadonlyBucket", new BucketProps
        {
            BucketName = $"melo-melo-private-readonly-bucket-{Env}".ToLower(),
            PublicReadAccess = false,
            BlockPublicAccess = BlockPublicAccess.BLOCK_ALL,
            RemovalPolicy = RemovalPolicy.RETAIN,
        });

        PublicReadonlyBucket = new Bucket(this, "PublicReadonlyBucket", new BucketProps
        {
            BucketName = $"melo-melo-public-readonly-bucket-{Env}".ToLower(),
            PublicReadAccess = true,
            BlockPublicAccess = BlockPublicAccess.BLOCK_ACLS,
            RemovalPolicy = RemovalPolicy.RETAIN,
        });
    }
}