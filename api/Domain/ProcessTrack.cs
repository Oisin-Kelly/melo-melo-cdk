using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Serialization;

namespace Domain;

public record UploadTrackRequest
{
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("audioKey")] public string? AudioKey { get; set; }
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("genre")] public string? Genre { get; set; }
    [JsonPropertyName("caption")] public string? Caption { get; set; }
    [JsonPropertyName("imageKey")] public string? ImageKey { get; set; }
    [JsonPropertyName("sharedWith")] public List<string> SharedWith { get; set; } = [];
}

public record ProcessTrackInput : UploadTrackRequest
{
    public ProcessTrackInput()
    {
    }

    [SetsRequiredMembers]
    public ProcessTrackInput(UploadTrackRequest request, string username) : base(request)
    {
        Username = username;
    }

    [JsonPropertyName("username")] public required string Username { get; set; }

    // Minted by UploadTrackLambda so the client can poll GET /tracks/uploads/{trackId}
    [JsonPropertyName("trackId")] public string? TrackId { get; set; }
}

public record ProcessTrackOutput
{
    [JsonPropertyName("trackId")] public required string TrackId { get; set; }
    [JsonPropertyName("success")] public required bool Success { get; set; }
}
