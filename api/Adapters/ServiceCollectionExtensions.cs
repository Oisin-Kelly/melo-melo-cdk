using Adapters.Repositories;
using Adapters.Services;
using Amazon.DynamoDBv2;
using Microsoft.Extensions.DependencyInjection;
using Ports.Repositories;
using Ports.Services;

namespace Adapters;

public static class ServiceCollectionExtensions
{
    // The whole data layer for a Lambda: the DynamoDB client + service bound to the table, and every
    // repository. Registering all of them (rather than each Lambda listing the few it uses) means a
    // repository can gain a dependency without touching dozens of Startup.cs files; unused ones cost
    // nothing until resolved.
    public static IServiceCollection AddMeloMeloData(this IServiceCollection services, string tableName)
    {
        services.AddSingleton<IAmazonDynamoDB>(new AmazonDynamoDBClient());
        services.AddTransient<IDynamoDBService>(provider =>
            new DynamoDBService(provider.GetRequiredService<IAmazonDynamoDB>(), tableName));

        services.AddTransient<IUserRepository, UserRepository>();
        services.AddTransient<IFollowRepository, FollowRepository>();
        services.AddTransient<ITrackRepository, TrackRepository>();
        services.AddTransient<ISharedTrackRepository, SharedTrackRepository>();
        services.AddTransient<ILikeRepository, LikeRepository>();
        services.AddTransient<IUploadStatusRepository, UploadStatusRepository>();
        services.AddTransient<IAlbumRepository, AlbumRepository>();
        services.AddTransient<IAlbumTracklistRepository, AlbumTracklistRepository>();
        services.AddTransient<IAlbumShareRepository, AlbumShareRepository>();
        services.AddTransient<IAlbumLikeRepository, AlbumLikeRepository>();
        services.AddTransient<IPlaylistRepository, PlaylistRepository>();
        services.AddTransient<IFeedRepository, FeedRepository>();
        services.AddTransient<IActivityRepository, ActivityRepository>();
        services.AddTransient<IProgressRepository, ProgressRepository>();
        services.AddTransient<ISlugRepository, SlugRepository>();
        services.AddTransient<IShareLinkRepository, ShareLinkRepository>();
        services.AddTransient<ILinkTargetService, LinkTargetService>();

        return services;
    }
}
