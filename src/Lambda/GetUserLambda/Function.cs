using System.Diagnostics.CodeAnalysis;
using System.Net;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Ports;
using System.Text.Json;
using Adapters;
using Amazon.Lambda.Annotations;

namespace GetUserLambda;

public class Function
{
    private readonly IUserRepository _userRepository;

    [DynamicDependency(DynamicallyAccessedMemberTypes.All, typeof(Function))]
    [DynamicDependency(DynamicallyAccessedMemberTypes.All, typeof(UserRepository))]
    public Function(IUserRepository userRepository)
    {
        _userRepository = userRepository;
    }

    [LambdaFunction]
    public async Task<APIGatewayProxyResponse> FunctionHandler(APIGatewayProxyRequest request, ILambdaContext context)
    {
        request.PathParameters.TryGetValue("username", out var requestedUsername);
        
        if (string.IsNullOrWhiteSpace(requestedUsername))
        {
            return new APIGatewayProxyResponse
            {
                StatusCode = (int)HttpStatusCode.BadRequest,
                Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                Body = JsonSerializer.Serialize(new
                        ErrorResponse("the path parameter 'username' is missing", "Bad Request", (int)HttpStatusCode.BadRequest),
                    CustomJsonSerializerContext.Default.ErrorResponse
                )
            };
        }

        try
        {
            var user = await _userRepository.GetUserByUsername(requestedUsername);
            
            if (user == null)
            {
                return new APIGatewayProxyResponse
                {
                    StatusCode = (int)HttpStatusCode.BadRequest,
                    Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                    Body = JsonSerializer.Serialize(new
                            ErrorResponse($"no user found by username {requestedUsername}", "Not Found",
                                (int)HttpStatusCode.BadRequest),
                        CustomJsonSerializerContext.Default.ErrorResponse
                    )
                };
            }

            return new APIGatewayProxyResponse
            {
                StatusCode = (int)HttpStatusCode.OK,
                Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                Body = JsonSerializer.Serialize(
                    user,
                    CustomJsonSerializerContext.Default.User
                )
            };
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetUserLambda. Error: {ex.Message}");
            
            return new APIGatewayProxyResponse
            {
                StatusCode = (int)HttpStatusCode.InternalServerError,
                Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                Body = JsonSerializer.Serialize(new
                        ErrorResponse(ex.Message, "Internal Server Error", (int)HttpStatusCode.InternalServerError),
                    CustomJsonSerializerContext.Default.ErrorResponse
                )
            };
        }
    }
}