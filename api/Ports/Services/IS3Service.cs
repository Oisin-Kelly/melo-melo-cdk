using Amazon.S3.Model;

namespace Ports.Services;

public interface IS3Service
{
    public Task<GetObjectResponse> GetObjectResponseAsync(string objectName);
    public Task<string> PutObjectAsync(Stream stream, string objectName, string? contentType = null);
    public Task<GetObjectMetadataResponse> GetObjectMetadata(string objectName);
    public Task<string> GetPresignedPutUrlAsync(string key, TimeSpan expiry);
    public Task<string> GetPresignedGetUrlAsync(string key, TimeSpan expiry);
    // A presigned GET that S3 answers with this Content-Disposition (e.g. attachment + filename)
    public Task<string> GetPresignedDownloadUrlAsync(string key, TimeSpan expiry, string contentDisposition);
    public Task DeleteObjectAsync(string key);
}