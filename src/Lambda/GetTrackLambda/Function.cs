using System.Text.Json;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Microsoft.Extensions.DependencyInjection;
using Ports;

// Assembly attribute to enable the Lambda function's JSON input to be converted into a .NET class.
[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace GetTrackLambda;

public class Function
{
    private readonly ITrackRepository _trackRepository;
    private readonly ITrackSharingService _trackSharingService;

    public Function()
    {
        var services = new ServiceCollection();
        new Startup().ConfigureServices(services);
        var serviceProvider = services.BuildServiceProvider();

        _trackRepository = serviceProvider.GetRequiredService<ITrackRepository>();
        _trackSharingService = serviceProvider.GetRequiredService<ITrackSharingService>();
    }
    
    public Function(ITrackRepository trackRepository)
    {
        _trackRepository = trackRepository;
    }
    
    public async Task<APIGatewayProxyResponse> FunctionHandler(APIGatewayProxyRequest request, ILambdaContext context)
    {
        var trackId = request.PathParameters["trackId"];
        var requestorUsername = request.RequestContext.Authorizer.Claims["cognito:username"];
        
        if (string.IsNullOrWhiteSpace(trackId))
        {
            return new APIGatewayProxyResponse
            {
                StatusCode = 400,
                Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                Body = JsonSerializer.Serialize(new
                {
                    message = "Error: You are missing the path parameter trackId"
                })
            };
        }
        
        try
        {
            var track = await _trackRepository.GetTrackAsync(trackId);
            
            if (track == null)
            {
                return new APIGatewayProxyResponse
                {
                    StatusCode = 404,
                    Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                    Body = JsonSerializer.Serialize(new
                    {
                        message = "Error: no track found"
                    })
                };
            }

            if (track.Owner.Username != requestorUsername)
            {
                if (!await _trackSharingService.IsTrackSharedWithUser(trackId, requestorUsername))
                {
                    return new APIGatewayProxyResponse
                    {
                        StatusCode = 404,
                        Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                        Body = JsonSerializer.Serialize(new
                        {
                            message = "Error: no track found"
                        })
                    };
                }
            }

            return new APIGatewayProxyResponse
            {
                StatusCode = 200,
                Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                Body = JsonSerializer.Serialize(track)
            };
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetTrackLambda. Error: {ex.Message}");
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