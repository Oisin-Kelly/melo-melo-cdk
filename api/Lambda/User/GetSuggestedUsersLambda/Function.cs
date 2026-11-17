using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;

namespace GetSuggestedUsersLambda;

// People you may know, for the caller: up to 20, strongest first
public sealed class Function : BaseLambdaFunctionHandler
{
    private const int Limit = 20;

    private readonly ISuggestionRepository _suggestionRepository;

    public Function(ISuggestionRepository suggestionRepository)
    {
        _suggestionRepository = suggestionRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/users/suggestions")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        try
        {
            var items = await _suggestionRepository.GetSuggestionsAsync(username, Limit);
            return Ok(JsonSerializer.Serialize(new SuggestionsResponse { Items = items },
                GetSuggestedUsersJsonContext.Default.SuggestionsResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetSuggestedUsersLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
