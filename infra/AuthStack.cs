using Amazon.CDK;
using Amazon.CDK.AWS.Cognito;
using Amazon.CDK.AWS.IAM;
using Amazon.CDK.AWS.Lambda;
using PolicyStatement = Amazon.CDK.AWS.IAM.PolicyStatement;
using Constructs;

namespace MeloMeloCdk;

public class AuthStack : BaseStack
{
    public UserPool UserPool { get; }
    public IUserPoolClient UserPoolClient { get; }

    public AuthStack(Construct scope, string id, IFunction postConfirmationFunction,
        IFunction checkEmailExistenceFunction, IStackProps props = null) : base(scope, id, props)
    {
        UserPool = new UserPool(this, "UserPool", new UserPoolProps()
        {
            RemovalPolicy = DeletionPolicy,
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
                PostConfirmation = postConfirmationFunction,
                PreSignUp = checkEmailExistenceFunction
            },
        });

        UserPoolClient = UserPool.AddClient("AppClient", new UserPoolClientOptions()
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
            PreventUserExistenceErrors = true,
        });

        checkEmailExistenceFunction.Role!.AttachInlinePolicy(
            new Policy(this, "UserPoolPolicy", new PolicyProps
            {
                Statements =
                [
                    new PolicyStatement(new PolicyStatementProps
                    {
                        Actions = ["cognito-idp:ListUsers"],
                        Resources = [UserPool.UserPoolArn],
                        Effect = Effect.ALLOW
                    })
                ]
            })
        );
    }
}