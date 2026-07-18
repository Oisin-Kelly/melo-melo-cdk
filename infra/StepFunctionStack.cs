using Amazon.CDK;
using Amazon.CDK.AWS.DynamoDB;
using Amazon.CDK.AWS.Lambda;
using Amazon.CDK.AWS.S3;
using Amazon.CDK.AWS.StepFunctions;
using Amazon.CDK.AWS.StepFunctions.Tasks;
using Constructs;

namespace MeloMeloCdk;

public class StepFunctionStack : BaseStack
{
    public StateMachine UploadTrackStateMachine { get; }

    public StepFunctionStack(Construct scope, string id, ITable table, IBucket dropboxBucket,
        IBucket publicReadonlyBucket, IBucket privateReadonlyBucket, IStackProps props = null)
        : base(scope, id, props)
    {
        var ffmpegLayer = new LayerVersion(this, "FfmpegLayer", new LayerVersionProps
        {
            Code = Code.FromAsset("api/Lambda/Layers/ffmpeg.zip"),
            CompatibleRuntimes = [Runtime.PROVIDED_AL2023],
            CompatibleArchitectures = [Architecture.ARM_64],
            Description = "ffmpeg binary for audio processing",
        });
        ffmpegLayer.ApplyRemovalPolicy(DeletionPolicy);

        var ffprobeLayer = new LayerVersion(this, "FfprobeLayer", new LayerVersionProps
        {
            Code = Code.FromAsset("api/Lambda/Layers/ffprobe.zip"),
            CompatibleRuntimes = [Runtime.PROVIDED_AL2023],
            CompatibleArchitectures = [Architecture.ARM_64],
            Description = "ffprobe binary for audio inspection",
        });
        ffprobeLayer.ApplyRemovalPolicy(DeletionPolicy);

        var processTrackFunction = CreateAotFunction("Track/ProcessTrackLambda", table, dropboxBucket,
            publicReadonlyBucket, privateReadonlyBucket, memorySize: 1024, timeout: Duration.Minutes(15),
            layers: [ffmpegLayer, ffprobeLayer]);
        table.GrantReadWriteData(processTrackFunction);
        dropboxBucket.GrantRead(processTrackFunction);
        privateReadonlyBucket.GrantReadWrite(processTrackFunction);
        publicReadonlyBucket.GrantReadWrite(processTrackFunction);

        var processTrackTask = new LambdaInvoke(this, "ProcessTrack", new LambdaInvokeProps
        {
            LambdaFunction = processTrackFunction,
            OutputPath = "$.Payload",
        });
        processTrackTask.AddRetry(new RetryProps
        {
            Errors = ["Lambda.TooManyRequestsException"],
            Interval = Duration.Seconds(2),
            MaxAttempts = 6,
            BackoffRate = 2,
        });

        UploadTrackStateMachine = new StateMachine(this, "UploadTrackStateMachine", new StateMachineProps
        {
            StateMachineName = $"melo-melo-upload-track-{Env}",
            DefinitionBody = DefinitionBody.FromChainable(processTrackTask),
            StateMachineType = StateMachineType.EXPRESS,
            Timeout = Duration.Minutes(10),
        });
        UploadTrackStateMachine.ApplyRemovalPolicy(DeletionPolicy);
    }
}
