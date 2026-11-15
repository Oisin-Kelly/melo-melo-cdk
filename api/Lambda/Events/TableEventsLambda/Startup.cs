using Adapters;
using Adapters.Events;
using Amazon.Lambda.Annotations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Ports.Events;

namespace TableEventsLambda;

[LambdaStartup]
public class Startup
{
    public HostApplicationBuilder ConfigureHostBuilder()
    {
        var builder = new HostApplicationBuilder();

        var tableName = Environment.GetEnvironmentVariable("TABLE_NAME")
                        ?? throw new InvalidOperationException("TABLE_NAME environment variable is required");

        builder.Services.AddMeloMeloData(tableName);
        builder.Services.AddTransient<ITableChangeHandler, ActivityEvents>();

        return builder;
    }
}
