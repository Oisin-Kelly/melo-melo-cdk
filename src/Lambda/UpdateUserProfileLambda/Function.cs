using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports;

namespace UpdateUserProfileLambda;

public record UpdateProfileRequest
{
    [JsonPropertyName("displayName")] public string? DisplayName { get; set; }

    [JsonPropertyName("firstName")] public string? FirstName { get; set; }

    [JsonPropertyName("lastName")] public string? LastName { get; set; }

    [JsonPropertyName("city")] public string? City { get; set; }

    [JsonPropertyName("country")] public string? Country { get; set; }

    [JsonPropertyName("bio")] public string? Bio { get; set; }

    [JsonPropertyName("imageKey")] public string? ImageKey { get; set; }

    [JsonPropertyName("followersPrivate")] public bool FollowersPrivate { get; set; }

    [JsonPropertyName("followingsPrivate")]
    public bool FollowingsPrivate { get; set; }

    [JsonPropertyName("clearedImage")] public bool ClearedImage { get; set; }
}

public class Function : BaseLambdaFunctionHandler
{
    private readonly IUserRepository _userRepository;
    private readonly IImageService _imageService;
    private readonly IUserValidationService _userValidationService;

    public Function(IUserRepository userRepository, IImageService imageService,
        IUserValidationService userValidationService)
    {
        _userRepository = userRepository;
        _imageService = imageService;
        _userValidationService = userValidationService;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/profile/update")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context, [FromBody] UpdateProfileRequest updateProfileRequest)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            var updateUser = await GetUpdatedUser(updateProfileRequest, username);
            context.Logger.Log("updateUser: ", JsonSerializer.Serialize(updateUser, CustomJsonSerializerContext.Default.User));
            
            var sanitisedUser = await _userValidationService.ValidateUser(updateUser);
            context.Logger.Log("sanitisedUser: " + JsonSerializer.Serialize(sanitisedUser, CustomJsonSerializerContext.Default.User));
            
            var newUser = await _userRepository.UpdateUser(sanitisedUser, updateProfileRequest.ClearedImage);
            context.Logger.Log("newUser: ", JsonSerializer.Serialize(newUser, CustomJsonSerializerContext.Default.User));

            return newUser is null
                ? Error(HttpStatusCode.InternalServerError, "Could not update user", "Internal Server Error")
                : Ok(JsonSerializer.Serialize(newUser, CustomJsonSerializerContext.Default.User));
        }
        catch (ArgumentException aex)
        {
            context.Logger.LogError(aex.Message);
            return Error(HttpStatusCode.BadRequest, aex.Message, "Bad Request");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in UpdateUserProfileLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }

    private async Task<User> GetUpdatedUser(UpdateProfileRequest updateProfileRequest, string username)
    {
        ImageProcessingResult? imageProcessingResult = null;

        if (updateProfileRequest.ImageKey is not null)
        {
            imageProcessingResult = await _imageService.ProcessImageAsync(
                updateProfileRequest.ImageKey,
                $"users/{username}/profile_400x400.jpg",
                400,
                400
            );
        }

        return new User()
        {
            Username = username,
            DisplayName = updateProfileRequest.DisplayName,
            FirstName = updateProfileRequest.FirstName,
            LastName = updateProfileRequest.LastName,
            City = updateProfileRequest.City,
            Country = updateProfileRequest.Country,
            Bio = updateProfileRequest.Bio,
            FollowersPrivate = updateProfileRequest.FollowersPrivate,
            FollowingsPrivate = updateProfileRequest.FollowingsPrivate,
            CreatedAt = 0,
            FollowerCount = 0,
            FollowingCount = 0,
            ImageBgColor = imageProcessingResult?.ImageHex,
            ImageUrl = imageProcessingResult?.ImageUrl,
        };
    }
}