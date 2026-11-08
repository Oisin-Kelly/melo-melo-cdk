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
            // Optional two-step verification with an authenticator app (TOTP) — each person turns
            // it on in Settings. No SMS (per-message cost + SNS setup) and no email codes (need
            // the Essentials tier). Lost phone: scripts/disable-two-step.sh.
            Mfa = Mfa.OPTIONAL,
            MfaSecondFactor = new MfaSecondFactor { Otp = true, Sms = false },
            UserVerification = new UserVerificationConfig()
            {
                EmailSubject = "Verify your MeloMelo account",
                EmailStyle = VerificationEmailStyle.CODE
            },
            // cdk.json email: SES with our own sender, else Cognito's built-in one
            Email = Config.Email is { } email
                ? UserPoolEmail.WithSES(new UserPoolSESOptions()
                {
                    FromEmail = email.FromEmail,
                    FromName = email.FromName,
                    SesRegion = email.SesRegion,
                    SesVerifiedDomain = email.VerifiedDomain,
                })
                : UserPoolEmail.WithCognito(),
            LambdaTriggers = new UserPoolTriggers()
            {
                PostConfirmation = postConfirmationFunction,
                PreSignUp = checkEmailExistenceFunction
            },
        });

        UserPoolClient = UserPool.AddClient("AppClient", new UserPoolClientOptions()
        {
            // No hosted UI / federated login — omitting OAuth would let CDK default-enable
            // the code + implicit grants with an example.com callback
            DisableOAuth = true,
            IdTokenValidity = Duration.Hours(8),
            AccessTokenValidity = Duration.Hours(8),
            RefreshTokenValidity = Duration.Days(90),
            AuthFlows = new AuthFlow()
            {
                // SRP for the web app (Amplify's default); UserPassword for the e2e fixtures
                UserSrp = true,
                UserPassword = true
            },
            PreventUserExistenceErrors = true,
        });

        // Consumed by CI (--outputs-file) to point the e2e suite at the deployed pool
        new CfnOutput(this, "UserPoolId", new CfnOutputProps { Value = UserPool.UserPoolId });
        new CfnOutput(this, "UserPoolClientId", new CfnOutputProps { Value = UserPoolClient.UserPoolClientId });

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