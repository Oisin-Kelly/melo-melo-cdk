namespace Domain
{
    public class User
    {
        public string Username { get; set; }
        public string? DisplayName { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Country { get; set; }
        public string? City { get; set; }
        public string? Bio { get; set; }
        public string? ImageUrl { get; set; }
        public string? ImageBgColor { get; set; }
        public int FollowingCount { get; set; }
        public int FollowerCount { get; set; }
        public bool FollowingsPrivate { get; set; }
        public bool FollowersPrivate { get; set; }
        public long CreatedAt { get; set; }
        public string GSI1PK { get; set; }

        public User() { }

        public User(string username, string? displayName, string? firstName, string? lastName,
                    string? country, string? city, string? bio, string? imageUrl, string? imageBgColor,
                    int followingCount, int followerCount, bool followingsPrivate, bool followersPrivate,
                    long createdAt)
        {
            Username = username;
            DisplayName = displayName;
            FirstName = firstName;
            LastName = lastName;
            Country = country;
            City = city;
            Bio = bio;
            ImageUrl = imageUrl;
            ImageBgColor = imageBgColor;
            FollowingCount = followingCount;
            FollowerCount = followerCount;
            FollowingsPrivate = followingsPrivate;
            FollowersPrivate = followersPrivate;
            CreatedAt = createdAt;
        }
    }

    public class UserDataModel : User
    {
        public string PK { get; set; }
        public string SK { get; set; }
        
        public UserDataModel() { }

        public UserDataModel(string PK, string SK,
            string username, string? displayName, string? firstName, string? lastName,
            string? country, string? city, string? bio, string? imageUrl, string? imageBgColor,
            int followingCount, int followerCount, bool followingsPrivate, bool followersPrivate,
            long createdAt)
            : base(username, displayName, firstName, lastName, country, city, bio, imageUrl, imageBgColor,
                   followingCount, followerCount, followingsPrivate, followersPrivate, createdAt)
        {
            this.PK = PK;
            this.SK = SK;
        }
    }
}