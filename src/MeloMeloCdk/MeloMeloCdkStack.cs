using Amazon.CDK;
using Amazon.CDK.AWS.AppSync;
using Amazon.CDK.AWS.DynamoDB;
using Amazon.CDK.AWS.S3;
using Constructs;

namespace MeloMeloCdk
{
    public class MeloMeloCdkStack : Stack
    {
        private string Env { get; set; }
        
        private Table DynamoDbTable { get; set; }
        private Bucket DropboxBucket { get; set; }
        private Bucket PrivateReadonlyBucket { get; set; }
        private Bucket PublicReadonlyBucket { get; set; }
        
        internal MeloMeloCdkStack(Construct scope, string id, IStackProps props = null) : base(scope, id, props)
        {
            Env = System.Environment.GetEnvironmentVariable("ENVIRONMENT") ?? "dev";
            
            InitialiseTable();
            InitialiseBuckets();
            
        }

        private void InitialiseTable()
        {
            DynamoDbTable = new Table(this, Env + "_DynamoDBTable", new TableProps
            {
                PartitionKey = new Attribute
                {
                    Name = "PK",
                    Type = AttributeType.STRING
                },
                SortKey = new Attribute
                {
                    Name = "SK",
                    Type = AttributeType.STRING
                },
                BillingMode = BillingMode.PAY_PER_REQUEST,
                TableName = "MeloMeloTable"
            });
            
            DynamoDbTable.AddGlobalSecondaryIndex(new GlobalSecondaryIndexProps
            {
                IndexName = "GSI1",
                PartitionKey = new Attribute
                {
                    Name = "GSI1PK",
                    Type = AttributeType.STRING
                },
                SortKey =  new Attribute
                {
                    Name = "GSI1SK",
                    Type = AttributeType.STRING
                },
                ProjectionType =  ProjectionType.ALL
            });
        }
        
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
}
