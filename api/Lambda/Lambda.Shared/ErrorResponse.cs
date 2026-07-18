using System.Text.Json.Serialization;

namespace Lambda.Shared;

public record ErrorResponse
{
    [JsonPropertyName("statusCode")] public int StatusCode { get; init; }
    
    [JsonPropertyName("message")] public required string Message { get; init; }
    
    [JsonPropertyName("error")] public required string Error { get; init; }
}
