using Amazon.CDK.AWS.APIGateway;
using Amazon.CDK.AWS.Apigatewayv2;
using Amazon.CDK.AwsApigatewayv2Authorizers;

namespace MeloMeloCdk;

public partial class MeloMeloCdkStack
{
    private HttpApi HttpApi { get; set; }
    private HttpUserPoolAuthorizer Authorizer { get; set; }

    private void InitialiseApi()
    {
        Authorizer = new HttpUserPoolAuthorizer("CognitoAuthorizer", UserPool, new HttpUserPoolAuthorizerProps
        {
            UserPoolClients = new[] { UserPoolClient }
        });

        HttpApi = new HttpApi(this, $"{Env}_MeloMeloCdk", new HttpApiProps
        {
            DefaultAuthorizer = Authorizer,
            ApiName = $"MeloMeloHttpApi_{Env}",
            CorsPreflight = new CorsPreflightOptions()
            {
                AllowOrigins = Cors.ALL_ORIGINS,
                AllowHeaders = Cors.DEFAULT_HEADERS,
                AllowMethods = new[]
                {
                    CorsHttpMethod.GET,
                    CorsHttpMethod.POST,
                    CorsHttpMethod.PUT,
                    CorsHttpMethod.DELETE,
                    CorsHttpMethod.OPTIONS
                }
            }
        });
    }
}