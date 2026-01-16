using Amazon.S3.Model;

namespace Ports;

public interface IS3Service
{
    public Task<GetObjectResponse> GetObjectResponseAsync(string objectName);
    public Task<string> PutObjectAsync(Stream stream, string objectName);
    public Task<GetObjectMetadataResponse> GetObjectMetadata(string objectName);
}