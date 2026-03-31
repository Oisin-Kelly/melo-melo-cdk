using Amazon.CDK;
using Constructs;

namespace MeloMeloCdk;

public abstract class BaseStack : Stack
{
    protected string Env { get; }
    protected RemovalPolicy DeletionPolicy { get; }

    protected BaseStack(Construct scope, string id, IStackProps props = null) : base(scope, id, props)
    {
        Env = System.Environment.GetEnvironmentVariable("ENVIRONMENT") ?? "dev";
        DeletionPolicy = Env == "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    }
}
