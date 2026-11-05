using Amazon.CDK;

namespace MeloMeloCdk
{
    sealed class Program
    {
        public static void Main(string[] args)
        {
            var app = new App();
            // -c env=… or ENVIRONMENT (default dev); its settings live in cdk.json (EnvConfig)
            var env = EnvConfig.Load(app).Name;

            var data = new DataStack(app, $"data-stack-{env}");
            var storage = new StorageStack(app, $"storage-stack-{env}");
            var lambda = new LambdaStack(app, $"lambda-stack-{env}", data.Table, storage.DropboxBucket,
                storage.PublicReadonlyBucket, storage.PrivateReadonlyBucket);
            var auth = new AuthStack(app, $"auth-stack-{env}", lambda.PostConfirmationFunction,
                lambda.CheckEmailExistenceFunction);
            var sfn = new StepFunctionStack(app, $"sfn-stack-{env}", data.Table, storage.DropboxBucket,
                storage.PublicReadonlyBucket, storage.PrivateReadonlyBucket);

            sfn.UploadTrackStateMachine.GrantStartExecution(lambda.UploadTrackFunction);
            lambda.UploadTrackFunction.AddEnvironment("STATE_MACHINE_ARN", sfn.UploadTrackStateMachine.StateMachineArn);

            var api = new ApiStack(app, $"api-stack-{env}", lambda.ApiFunctions, auth.UserPool, auth.UserPoolClient);

            // web-stack bundles web/dist as an asset, so it can only exist when the frontend
            // has been built — backend-only deploys and CI never build it and must still synth.
            if (System.IO.Directory.Exists("web/dist"))
                _ = new WebStack(app, $"web-stack-{env}");
            else
                System.Console.Error.WriteLine("web-stack skipped — web/dist missing; run scripts/deploy-web.sh to build and deploy the frontend");

            app.Synth();
        }
    }
}