using System.Text.Json.Serialization;
using Amazon.Lambda.CognitoEvents;

namespace CheckEmailExistenceLambda;

[JsonSerializable(typeof(CognitoPreSignupEvent))]
public partial class CheckEmailExistenceJsonContext : JsonSerializerContext
{
}