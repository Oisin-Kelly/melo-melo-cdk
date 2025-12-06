using Amazon.CDK;
using Amazon.CDK.AWS.Cognito;
using Amazon.CDK.AWS.DynamoDB;
using Amazon.CDK.AWS.IAM;
using Amazon.CDK.AWS.S3;
using Constructs;

namespace MeloMeloCdk
{
    public partial class MeloMeloCdkStack : Stack
    {
        private string Env { get; }

        private ITable DynamoDbTable { get; set; }
        private IBucket DropboxBucket { get; set; }
        private IBucket PrivateReadonlyBucket { get; set; }
        private IBucket PublicReadonlyBucket { get; set; }

        private IUserPool UserPool { get; set; }

        internal MeloMeloCdkStack(Construct scope, string id, IStackProps props = null) : base(scope, id, props)
        {
            Env = System.Environment.GetEnvironmentVariable("ENVIRONMENT") ?? "dev";

            InitialiseTable();
            
            InitialiseUserPoolLambdas();
            InitialiseCognito();
            
            InitialiseBuckets();

            InitialiseApi();
            InitialiseApiLambdas();
            InitialiseLambdaIntegrations();
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
                    EmailStyle = VerificationEmailStyle.CODE
                },
                LambdaTriggers = new UserPoolTriggers()
                {
                    PostConfirmation = PostConfirmationFunction,
                    PreSignUp = CheckEmailExistenceFunction
                }
            });

            UserPool.AddClient($"{Env}_AppClient", new UserPoolClientOptions()
            {
                OAuth = new OAuthSettings()
                {
                    Flows = new OAuthFlows()
                    {
                        AuthorizationCodeGrant = true
                    },
                },
                IdTokenValidity = Duration.Hours(8),
                AccessTokenValidity = Duration.Hours(8),
                RefreshTokenValidity = Duration.Days(90),
                AuthFlows = new AuthFlow()
                {
                    UserPassword = true
                },
                PreventUserExistenceErrors = true
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

        private void InitialiseTable()
        {
            var table = new Table(this, Env + "_DynamoDBTable", new TableProps()
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
                TableName = "MeloMeloTable",
            });

            table.AddGlobalSecondaryIndex(new GlobalSecondaryIndexProps()
            {
                IndexName = "GSI1",
                PartitionKey = new Attribute
                {
                    Name = "GSI1PK",
                    Type = AttributeType.STRING
                },
                SortKey = new Attribute
                {
                    Name = "GSI1SK",
                    Type = AttributeType.STRING
                },
                ProjectionType = ProjectionType.ALL
            });

            DynamoDbTable = table;
        }
    }
}