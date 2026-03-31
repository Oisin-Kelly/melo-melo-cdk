using System.Text.Json.Serialization;
using Amazon.Lambda.CognitoEvents;

namespace PostConfirmationLambda;

[JsonSerializable(typeof(CognitoPostConfirmationEvent))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}