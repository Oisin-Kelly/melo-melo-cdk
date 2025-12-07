using Amazon.CDK.AWS.APIGateway;
using Amazon.CDK.AWS.IAM;

namespace MeloMeloCdk;

public partial class MeloMeloCdkStack
{
    private IRestApi RestApi { get; set; }
    private IAuthorizer CognitoAuthorizer { get; set; }

    private void InitialiseApi()
    {
        RestApi = new RestApi(this, "MeloMeloCdk", new RestApiProps()
        {
            DeployOptions = new StageOptions()
            {
                StageName = Env
            },
            DefaultCorsPreflightOptions = new CorsOptions()
            {
                AllowOrigins = Cors.ALL_ORIGINS,
                AllowHeaders = Cors.DEFAULT_HEADERS,
                AllowCredentials = true,
                AllowMethods = Cors.ALL_METHODS,
            }
        });

        CognitoAuthorizer = new CognitoUserPoolsAuthorizer(this, "CognitoAuthorizer", new CognitoUserPoolsAuthorizerProps
        {
            CognitoUserPools = new[] { UserPool },
            IdentitySource = "method.request.header.Authorization",
            AuthorizerName = $"{Env}_CognitoAuthorizer"
        });
    }
}