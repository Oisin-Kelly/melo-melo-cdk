using Amazon.Lambda.Core;

namespace Lambda.Tests.Support;

// Minimal ILambdaContext for calling handlers directly; records what they log so tests can
// assert an error path was logged (or that nothing sensitive was).
public sealed class TestLambdaContext : ILambdaContext
{
    public TestLogger TestLogger { get; } = new();

    public string AwsRequestId => "test-request";
    public IClientContext ClientContext => null!;
    public string FunctionName => "test-function";
    public string FunctionVersion => "$LATEST";
    public ICognitoIdentity Identity => null!;
    public string InvokedFunctionArn => "arn:aws:lambda:eu-west-1:000000000000:function:test";
    public ILambdaLogger Logger => TestLogger;
    public string LogGroupName => "test";
    public string LogStreamName => "test";
    public int MemoryLimitInMB => 512;
    public TimeSpan RemainingTime => TimeSpan.FromMinutes(1);
}

public sealed class TestLogger : ILambdaLogger
{
    public List<string> Lines { get; } = [];
    public void Log(string message) => Lines.Add(message);
    public void LogLine(string message) => Lines.Add(message);
}
