using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Microsoft.Extensions.DependencyInjection;
using Ports;
using System.Text.Json;

// Assembly attribute to enable the Lambda function's JSON input to be converted into a .NET class.
[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace GetUserLambda;

public class Function
{
    private readonly IUserRepository _userRepository;

    public Function()
    {
        var services = new ServiceCollection();
        new Startup().ConfigureServices(services);
        var serviceProvider = services.BuildServiceProvider();

        _userRepository = serviceProvider.GetRequiredService<IUserRepository>();
    }
    
    public Function(IUserRepository userRepository)
    {
        _userRepository = userRepository;
    }
    
    public async Task<APIGatewayProxyResponse> FunctionHandler(APIGatewayProxyRequest request, ILambdaContext context)
    {
        var requestedUsername = request.PathParameters["username"];
        
        if (string.IsNullOrWhiteSpace(requestedUsername))
        {
            return new APIGatewayProxyResponse
            {
                StatusCode = 400,
                Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                Body = JsonSerializer.Serialize(new
                {
                    message = "Error: You are missing the path parameter username"
                })
            };
        }

        try
        {
            var user = await _userRepository.GetUserByUsername(requestedUsername);
            
            if (user == null)
            {
                return new APIGatewayProxyResponse
                {
                    StatusCode = 404,
                    Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                    Body = JsonSerializer.Serialize(new
                    {
                        message = "Error: no user found by username"
                    })
                };
            }

            return new APIGatewayProxyResponse
            {
                StatusCode = 200,
                Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                Body = JsonSerializer.Serialize(user)
            };
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetUserLambda. Error: {ex.Message}");
            return new APIGatewayProxyResponse
            {
                StatusCode = 500,
                Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                Body = JsonSerializer.Serialize(new
                {
                    message = "Internal server error",
                    error = ex.Message
                })
            };
        }
    }
}