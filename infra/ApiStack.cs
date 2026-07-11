using Amazon.CDK;
using Amazon.CDK.AWS.APIGateway;
using Amazon.CDK.AWS.Apigatewayv2;
using Amazon.CDK.AwsApigatewayv2Authorizers;
using Amazon.CDK.AWS.Lambda;
using Amazon.CDK.AWS.Cognito;
using Amazon.CDK.AwsApigatewayv2Integrations;
using Constructs;
using HttpMethod = Amazon.CDK.AWS.Apigatewayv2.HttpMethod;

namespace MeloMeloCdk;

public class ApiStack : BaseStack
{
    private HttpApi HttpApi { get; }
    private HttpUserPoolAuthorizer Authorizer { get; }

    public ApiStack(Construct scope, string id, ApiFunctions functions, UserPool userPool,
        IUserPoolClient userPoolClient, IStackProps props = null) : base(scope, id, props)
    {
        Authorizer = new HttpUserPoolAuthorizer("CognitoAuthorizer", userPool, new HttpUserPoolAuthorizerProps
        {
            UserPoolClients = [userPoolClient]
        });

        HttpApi = new HttpApi(this, "HttpApi", new HttpApiProps
        {
            DefaultAuthorizer = Authorizer,
            ApiName = $"melo-melo-http-api-{Env}",
            CorsPreflight = new CorsPreflightOptions()
            {
                AllowOrigins = Cors.ALL_ORIGINS,
                AllowHeaders = Cors.DEFAULT_HEADERS,
                AllowMethods =
                [
                    CorsHttpMethod.GET,
                    CorsHttpMethod.POST,
                    CorsHttpMethod.PUT,
                    CorsHttpMethod.DELETE,
                    CorsHttpMethod.OPTIONS
                ]
            },
        });
        HttpApi.ApplyRemovalPolicy(DeletionPolicy);

        // Consumed by CI (--outputs-file) to point the e2e suite at the deployed API
        new CfnOutput(this, "ApiBaseUrl", new CfnOutputProps { Value = HttpApi.Url! });

        HttpLambdaIntegration CreateIntegration(IFunction function) =>
            new HttpLambdaIntegration($"{function.Node.Id}Integration", function);

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/users/{username}",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetUser),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/users/{username}/shared",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetTracksSharedFromUser),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/users/{username}/follow-status",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.IsFollowingUser),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/users/{username}/follow-user",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.FollowUser),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/users/{username}/followers",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetUserFollowers),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/users/{username}/followings",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetUserFollowing),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks/{trackId}",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetTrack),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks/{trackId}",
            Methods = [HttpMethod.PUT],
            Integration = CreateIntegration(functions.UpdateTrack),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks/{trackId}",
            Methods = [HttpMethod.DELETE],
            Integration = CreateIntegration(functions.DeleteTrack),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks/{trackId}/share",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.ShareTrack),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks/uploads/{trackId}",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetUploadStatus),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks/{trackId}/segments",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetTrackSegments),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks/shared",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetTracksSharedWithUser),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/profile/update",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.UpdateProfile),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/buckets/dropbox",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetDropboxPresignedUrl),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetUserTracks),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks/upload",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.UploadTrack),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/playlists",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.CreatePlaylist),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/playlists",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetPlaylists),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/playlists/{playlistId}",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetPlaylist),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/playlists/{playlistId}",
            Methods = [HttpMethod.PUT],
            Integration = CreateIntegration(functions.UpdatePlaylist),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/playlists/{playlistId}",
            Methods = [HttpMethod.DELETE],
            Integration = CreateIntegration(functions.DeletePlaylist),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/playlists/{playlistId}/tracks",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.ModifyPlaylistTracks),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks/{trackId}/like",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.LikeTrack),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks/{trackId}/likes",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetTrackLikes),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/albums",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.CreateAlbum),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/albums",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetAlbums),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/albums/shared",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetAlbumsSharedWithMe),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/albums/{albumId}",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetAlbum),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/albums/{albumId}",
            Methods = [HttpMethod.PUT],
            Integration = CreateIntegration(functions.UpdateAlbum),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/albums/{albumId}",
            Methods = [HttpMethod.DELETE],
            Integration = CreateIntegration(functions.DeleteAlbum),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/albums/{albumId}/tracks",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.ModifyAlbumTracks),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/albums/{albumId}/share",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.ShareAlbum),
        });
    }
}