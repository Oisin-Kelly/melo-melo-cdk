# Boilerplate files

These files are identical across all Lambda patterns — only the namespace and registered types change.

## `Startup.cs`

```csharp
using Adapters;
using Amazon.DynamoDBv2;
using Amazon.Lambda.Annotations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Ports;

namespace {Name}Lambda;

[LambdaStartup]
public class Startup
{
    public HostApplicationBuilder ConfigureHostBuilder()
    {
        var builder = new HostApplicationBuilder();

        var tableName = Environment.GetEnvironmentVariable("TABLE_NAME")
                        ?? throw new InvalidOperationException("TABLE_NAME environment variable is required");

        builder.Services.AddSingleton<IAmazonDynamoDB>(new AmazonDynamoDBClient());
        builder.Services.AddTransient<IDynamoDBService>(provider =>
        {
            var client = provider.GetRequiredService<IAmazonDynamoDB>();
            return new DynamoDBService(client, tableName);
        });

        // Register repositories — see di-patterns.md for all options
        builder.Services.AddTransient<IUserRepository, UserRepository>();

        return builder;
    }
}
```

## `CustomJsonSerializerContext.cs`

```csharp
using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;
using Lambda.Shared;

namespace {Name}Lambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(ErrorResponse))]
// Add every type this Lambda serializes — including List<T> variants:
// [JsonSerializable(typeof(User))]
// [JsonSerializable(typeof(List<SharedTrack>))]
// [JsonSerializable(typeof({Name}Request))]
// [JsonSerializable(typeof({Name}Response))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
```

## `AssemblyInfo.cs`

```csharp
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Core;
using Amazon.Lambda.Serialization.SystemTextJson;
using {Name}Lambda;

[assembly: LambdaGlobalProperties(GenerateMain = true)]
[assembly: LambdaSerializer(typeof(SourceGeneratorLambdaJsonSerializer<CustomJsonSerializerContext>))]
```

## `{Name}Lambda.csproj`

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Amazon.Lambda.Annotations" Version="1.8.0" />
    <PackageReference Include="Amazon.Lambda.APIGatewayEvents" Version="2.7.3" />
    <PackageReference Include="Amazon.Lambda.Core" Version="2.8.0" />
    <PackageReference Include="Amazon.Lambda.RuntimeSupport" Version="1.14.1" />
    <PackageReference Include="Amazon.Lambda.Serialization.SystemTextJson" Version="2.4.4" />
    <PackageReference Include="Microsoft.Extensions.Hosting" Version="10.0.1" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="../Lambda.Shared/Lambda.Shared.csproj" />
    <ProjectReference Include="../../Ports/Ports.csproj" />
    <ProjectReference Include="../../Adapters/Adapters.csproj" />
  </ItemGroup>
</Project>
```

No `<PropertyGroup>` — inherited from `Directory.Build.props`.

Add extra packages only when needed:
- `AWSSDK.S3` for S3 access

---

## Infrastructure wiring

### `infra/ApiFunctions.cs` — add to the record:

```csharp
IFunction {Name}
```

### `infra/LambdaStack.cs` — add in constructor:

```csharp
var {camelName} = CreateLambdaFunction("{Name}Lambda", table, dropboxBucket, publicReadonlyBucket);
table.GrantReadData({camelName});        // read-only
// table.GrantReadWriteData({camelName}); // if the Lambda writes to DynamoDB
// dropboxBucket.GrantReadWrite({camelName});         // if the Lambda reads from dropbox
// publicReadonlyBucket.GrantReadWrite({camelName});  // if the Lambda writes public assets
```

Then add `{Name}: {camelName}` to the `ApiFunctions` constructor call.

### `infra/ApiStack.cs` — add route:

```csharp
HttpApi.AddRoutes(new AddRoutesOptions
{
    Path = "/your/route/{param}",
    Methods = [HttpMethod.GET],   // or POST, PUT, DELETE
    Integration = CreateIntegration(functions.{Name}),
});
```
