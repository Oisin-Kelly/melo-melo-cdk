using Amazon.DynamoDBv2.DataModel;

namespace Domain
{
    public class User
    {
        [DynamoDBProperty("username")] public required string Username { get; set; }

        [DynamoDBProperty("displayName")] public string? DisplayName { get; set; }

        [DynamoDBProperty("firstName")] public string? FirstName { get; set; }

        [DynamoDBProperty("lastName")] public string? LastName { get; set; }

        [DynamoDBProperty("country")] public string? Country { get; set; }

        [DynamoDBProperty("city")] public string? City { get; set; }

        [DynamoDBProperty("bio")] public string? Bio { get; set; }

        [DynamoDBProperty("imageUrl")] public string? ImageUrl { get; set; }

        [DynamoDBProperty("imageBgColor")] public string? ImageBgColor { get; set; }

        [DynamoDBProperty("followingCount")] public required int FollowingCount { get; set; }

        [DynamoDBProperty("followerCount")] public required int FollowerCount { get; set; }

        [DynamoDBProperty("followingsPrivate")]
        public required bool FollowingsPrivate { get; set; }

        [DynamoDBProperty("followersPrivate")] public required bool FollowersPrivate { get; set; }

        [DynamoDBProperty("createdAt")] public required long CreatedAt { get; set; }

        public User()
        {
        }
    }

    [DynamoDBTable("MeloMeloTable")]
    public class UserDataModel : User
    {
        [DynamoDBHashKey("PK")] public required string Pk { get; set; }

        [DynamoDBRangeKey("SK")] public required string Sk { get; set; }

        [DynamoDBGlobalSecondaryIndexHashKey("GSI1", "GSI1PK")]
        public required string Gsi1Pk { get; set; }

        [DynamoDBGlobalSecondaryIndexRangeKey("GSI1", "GSI1SK")]
        public string? Gsi1Sk { get; set; }

        public UserDataModel()
        {
        }

        public static UserDataModel CreateFromCognitoSignUp(string username, string userSub)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            return new UserDataModel
            {
                Pk = $"USER#{username}",
                Sk = "PROFILE",
                Gsi1Pk = $"USERSUB#{userSub}",
                Gsi1Sk = "PROFILE",
                Username = username,
                DisplayName = username,
                Country = "Ireland",
                Bio = "Hey! I'm using MeloMelo!",
                FollowingCount = 0,
                FollowerCount = 0,
                FollowingsPrivate = false,
                FollowersPrivate = false,
                CreatedAt = now
            };
        }
    }
}