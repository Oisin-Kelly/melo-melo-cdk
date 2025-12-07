using System.Text.Json;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Microsoft.Extensions.DependencyInjection;
using Ports;

// Assembly attribute to enable the Lambda function's JSON input to be converted into a .NET class.
[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace GetTracksSharedFromUserLambda;

public class Function
{
    private readonly ISharedTrackRepository _sharedTrackRepository;

    public Function()
    {
        var services = new ServiceCollection();
        new Startup().ConfigureServices(services);
        var serviceProvider = services.BuildServiceProvider();

        _sharedTrackRepository = serviceProvider.GetRequiredService<ISharedTrackRepository>();
    }

    public Function(ISharedTrackRepository sharedTrackRepository)
    {
        _sharedTrackRepository = sharedTrackRepository;
    }

    public async Task<APIGatewayProxyResponse> FunctionHandler(APIGatewayProxyRequest request, ILambdaContext context)
    {
        var requestedUsername = request.PathParameters["username"];
        var requestorUsername = request.RequestContext.Authorizer.Claims["cognito:username"];

        try
        {
            var sharedTracks =
                await _sharedTrackRepository.GetTracksSharedFromUser(requestedUsername, requestorUsername);

            return new APIGatewayProxyResponse
            {
                StatusCode = 200,
                Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                Body = JsonSerializer.Serialize(sharedTracks)
            };
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetTracksSharedFromUserLambda. Error: {ex.Message}");
            return new APIGatewayProxyResponse
            {
                StatusCode = 500,
                Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                Body = JsonSerializer.Serialize(new
                {
                    message = "Internal server error",
                    error = ex.Message,
                })
            };
        }
    }
}