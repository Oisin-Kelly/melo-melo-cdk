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

        // 1792MB = one full vCPU — the lame encode is single-threaded and CPU-bound,
        // so this ~1.75×es encode speed; more memory adds cores lame can't use
        var processTrackFunction = CreateAotFunction("Track/ProcessTrackLambda", table, dropboxBucket,
            publicReadonlyBucket, privateReadonlyBucket, memorySize: 1792, timeout: Duration.Minutes(15),
            layers: [ffmpegLayer, ffprobeLayer], ephemeralStorage: Size.Gibibytes(10));
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

        // Standard (not Express) so processing isn't hard-killed at Express's 5-minute
        // cap — the Lambda's own 15-minute timeout is the binding limit for long audio.
        // Type is immutable in CloudFormation, so the EXPRESS→STANDARD switch replaced
        // the machine; the name carries a -std suffix because create-before-delete
        // replacement can't reuse the old explicit name.
        UploadTrackStateMachine = new StateMachine(this, "UploadTrackStateMachine", new StateMachineProps
        {
            StateMachineName = $"melo-melo-upload-track-std-{Env}",
            DefinitionBody = DefinitionBody.FromChainable(processTrackTask),
            StateMachineType = StateMachineType.STANDARD,
            Timeout = Duration.Minutes(20),
        });
        UploadTrackStateMachine.ApplyRemovalPolicy(DeletionPolicy);
    }
}
