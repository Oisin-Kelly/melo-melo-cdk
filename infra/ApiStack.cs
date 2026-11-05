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
            Path = "/users/search",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.SearchUsers),
        });

        // Readable URL → item id (/{owner}/{slug}, /{owner}/albums/{slug}, /{owner}/playlists/{slug});
        // under /slugs/ so a slug can never collide with /users/{u}/albums/shared and friends
        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/users/{username}/slugs/{kind}/{slug}",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.ResolveSlug),
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
            Path = "/tracks/{trackId}/stream",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetTrackSegments),
        });

        // Owner-only download of the original upload, in its uploaded format
        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks/{trackId}/original",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetOriginalTrack),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks/shared",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetTracksSharedWithUser),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks/shared/{trackId}",
            Methods = [HttpMethod.DELETE],
            Integration = CreateIntegration(functions.RemoveSharedTrack),
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
            Path = "/tracks/library",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetLibraryTracks),
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
            Methods = [HttpMethod.PUT],
            Integration = CreateIntegration(functions.SetPlaylistTracks),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/playlists/{playlistId}/tracks/{trackId}",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.AddPlaylistTrack),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/playlists/{playlistId}/tracks/{trackId}",
            Methods = [HttpMethod.DELETE],
            Integration = CreateIntegration(functions.RemovePlaylistTrack),
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
            Path = "/tracks/{trackId}/recipients",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetTrackRecipients),
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
            Path = "/users/{username}/albums/shared",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetAlbumsSharedFromUser),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/albums/shared/{albumId}",
            Methods = [HttpMethod.DELETE],
            Integration = CreateIntegration(functions.RemoveSharedAlbum),
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
            Methods = [HttpMethod.PUT],
            Integration = CreateIntegration(functions.SetAlbumTracks),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/albums/{albumId}/share",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.ShareAlbum),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/albums/{albumId}/recipients",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetAlbumRecipients),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/albums/liked",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetLikedAlbums),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/albums/{albumId}/like",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.LikeAlbum),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/albums/{albumId}/likes",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetAlbumLikes),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/feed",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetFeed),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/me/progress",
            Methods = [HttpMethod.PUT],
            Integration = CreateIntegration(functions.UpdateProgress),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/me/progress",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetProgress),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/me/seen",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.MarkSeen),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/activity",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetActivity),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/me/activity-seen",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.MarkActivitySeen),
        });

        // Share links
        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/links",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.CreateLink),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/links",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetLinks),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/links/{token}",
            Methods = [HttpMethod.DELETE],
            Integration = CreateIntegration(functions.RevokeLink),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/links/{token}/restore",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.RestoreLink),
        });

        // The one public route: whoever opens a share link may not have an account yet. It only
        // ever reveals what the link's holder is meant to see (see GetLinkPreviewLambda).
        var linkPreviewRoutes = HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/links/{token}",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetLinkPreview),
            Authorizer = new HttpNoneAuthorizer(),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/links/{token}/viewer",
            Methods = [HttpMethod.GET],
            Integration = CreateIntegration(functions.GetLinkViewer),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/links/{token}/accept",
            Methods = [HttpMethod.POST],
            Integration = CreateIntegration(functions.AcceptLink),
        });

        // Throttle the public route on its own, so hammering it can't eat the account-wide limit
        // the rest of the API shares. Across all callers — fine at this app's size.
        // Route settings name a route key, which must exist before the stage is updated
        var stage = (Amazon.CDK.AWS.Apigatewayv2.CfnStage)HttpApi.DefaultStage!.Node.DefaultChild!;
        stage.Node.AddDependency(linkPreviewRoutes);
        stage.AddPropertyOverride("RouteSettings.GET /links/{token}.ThrottlingRateLimit", Config.LinkPreviewThrottle.RateLimit);
        stage.AddPropertyOverride("RouteSettings.GET /links/{token}.ThrottlingBurstLimit", Config.LinkPreviewThrottle.BurstLimit);
    }
}