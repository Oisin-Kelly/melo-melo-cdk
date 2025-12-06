using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain
{
    public class User
    {
        [JsonPropertyName("username")]
        [DynamoDBProperty("username")]
        public required string Username { get; set; }

        [JsonPropertyName("displayName")]
        [DynamoDBProperty("displayName")]
        public string? DisplayName { get; set; }

        [JsonPropertyName("firstName")]
        [DynamoDBProperty("firstName")]
        public string? FirstName { get; set; }

        [JsonPropertyName("lastName")]
        [DynamoDBProperty("lastName")]
        public string? LastName { get; set; }

        [JsonPropertyName("country")]
        [DynamoDBProperty("country")]
        public string? Country { get; set; }

        [JsonPropertyName("city")]
        [DynamoDBProperty("city")]
        public string? City { get; set; }

        [JsonPropertyName("bio")]
        [DynamoDBProperty("bio")]
        public string? Bio { get; set; }

        [JsonPropertyName("imageUrl")]
        [DynamoDBProperty("imageUrl")]
        public string? ImageUrl { get; set; }

        [JsonPropertyName("imageBgColor")]
        [DynamoDBProperty("imageBgColor")]
        public string? ImageBgColor { get; set; }

        [JsonPropertyName("followingCount")]
        [DynamoDBProperty("followingCount")]
        public required int FollowingCount { get; set; }

        [JsonPropertyName("followerCount")]
        [DynamoDBProperty("followerCount")]
        public required int FollowerCount { get; set; }

        [JsonPropertyName("followingsPrivate")]
        [DynamoDBProperty("followingsPrivate")]
        public required bool FollowingsPrivate { get; set; }

        [JsonPropertyName("followersPrivate")]
        [DynamoDBProperty("followersPrivate")]
        public required bool FollowersPrivate { get; set; }

        [JsonPropertyName("createdAt")]
        [DynamoDBProperty("createdAt")]
        public required long CreatedAt { get; set; }

        public User()
        {
        }
    }

    public class UserDataModel : User
    {
        [DynamoDBHashKey("PK")] public required string Pk { get; set; }

        [DynamoDBRangeKey("SK")] public required string Sk { get; set; }

        [DynamoDBGlobalSecondaryIndexHashKey("GSI1", AttributeName = "GSI1PK")]
        public required string Gsi1Pk { get; set; }

        [DynamoDBGlobalSecondaryIndexRangeKey("GSI1", AttributeName = "GSI1SK")]
        public string? Gsi1Sk { get; set; }

        public UserDataModel()
        {
        }

        public static UserDataModel CreateFromCognitoSignUp(string username, string email)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            return new UserDataModel
            {
                Pk = $"USER#{username}",
                Sk = "PROFILE",
                Gsi1Pk = $"EMAIL#{email}",
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