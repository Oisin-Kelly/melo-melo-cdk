using System.Collections.Generic;
using Amazon.CDK;
using Amazon.CDK.AWS.Cognito;
using Amazon.CDK.AWS.DynamoDB;
using Amazon.CDK.AWS.IAM;
using Amazon.CDK.AWS.Lambda;
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
        
        private UserPool UserPool { get; set; }
        
        private Function CheckEmailExistenceFunction { get; set; }
        private Function PostConfirmationFunction { get; set; }
        
        internal MeloMeloCdkStack(Construct scope, string id, IStackProps props = null) : base(scope, id, props)
        {
            Env = System.Environment.GetEnvironmentVariable("ENVIRONMENT") ?? "dev";
            
            InitialiseTable();
            InitialiseBuckets();
            InitialiseLambdas();
            InitialiseCognito();
        }

        private void InitialiseCognito()
        {
            UserPool = new UserPool(this, $"melo-melo-user-pool-{Env}", new UserPoolProps()
            {
                SelfSignUpEnabled = true,
                SignInAliases = new SignInAliases()
                {
                    Email = true,
                    Username = true,
                },
                StandardAttributes = new StandardAttributes()
                {
                    Email = new StandardAttribute()
                    {
                        Required = true,
                        Mutable = false
                    }
                },
                SignInCaseSensitive = false,
                UserVerification = new UserVerificationConfig()
                {
                    EmailSubject = "Verify your MeloMelo account",
                    EmailBody = "Verify your MeloMelo account",
                    EmailStyle = VerificationEmailStyle.CODE
                },
                LambdaTriggers = new UserPoolTriggers()
                {
                    PostConfirmation = PostConfirmationFunction,
                    PreSignUp = CheckEmailExistenceFunction,
                }
            });

            CheckEmailExistenceFunction.Role!.AttachInlinePolicy(
                new Policy(this, "userpool-policy", new PolicyProps
                {
                    Statements = new[]
                    {
                        new PolicyStatement(new PolicyStatementProps
                        {
                            Actions = new[] { "cognito-idp:ListUsers" },
                            Resources = new[] { UserPool.UserPoolArn },
                            Effect = Effect.ALLOW
                        })
                    }
                })
            );
        }

        private void InitialiseLambdas()
        {
            var lambdaProps = new FunctionProps()
            {
                Runtime = Runtime.DOTNET_8,
                MemorySize = 1024,
                Environment = new Dictionary<string, string>()
                {
                    { "ENVIRONMENT", Env },
                    { "TABLE_NAME", DynamoDbTable.TableName },
                    { "DROPBOX_BUCKET", DropboxBucket.BucketName },
                    { "PRIVATE_READONLY_BUCKET", PrivateReadonlyBucket.BucketName },
                    { "PUBLIC_READONLY_BUCKET", PublicReadonlyBucket.BucketName }
                }
            };

            CheckEmailExistenceFunction = new Function(this, "CheckEmailExistenceFunction", lambdaProps);
            PostConfirmationFunction = new Function(this, "PostConfirmationFunction", lambdaProps);
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
