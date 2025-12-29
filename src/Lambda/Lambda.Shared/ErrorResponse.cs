namespace Lambda.Shared;

public record ErrorResponse(int StatusCode, string Message, string Error);
