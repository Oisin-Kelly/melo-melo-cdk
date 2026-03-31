using Amazon.CDK;

namespace MeloMeloCdk
{
    sealed class Program
    {
        public static void Main(string[] args)
        {
            var app = new App();
            var env = System.Environment.GetEnvironmentVariable("ENVIRONMENT") ?? "dev";

            var data = new DataStack(app, $"data-stack-{env}");
            var storage = new StorageStack(app, $"storage-stack-{env}");
            var lambda = new LambdaStack(app, $"lambda-stack-{env}", data.Table, storage.DropboxBucket, storage.PublicReadonlyBucket, storage.PrivateReadonlyBucket);
            var auth = new AuthStack(app, $"auth-stack-{env}", lambda.PostConfirmationFunction, lambda.CheckEmailExistenceFunction);
            var api = new ApiStack(app, $"api-stack-{env}", lambda.ApiFunctions, auth.UserPool, auth.UserPoolClient);

            app.Synth();
        }
    }
}
