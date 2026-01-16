using Amazon.S3;
using Amazon.S3.Model;
using Ports;

namespace Adapters;

public class S3Service : IS3Service
{
    private readonly IAmazonS3 _s3Client;
    private readonly string _bucketName;

    public S3Service(IAmazonS3 s3Client, string bucketName)
    {
        _s3Client = s3Client;
        _bucketName = bucketName;
    }

    public async Task<GetObjectResponse> GetObjectResponseAsync(string objectName)
    {
        var request = new GetObjectRequest
        {
            BucketName = _bucketName,
            Key = objectName,
        };

        return await _s3Client.GetObjectAsync(request);
    }

    public async Task<string> PutObjectAsync(Stream stream, string objectName)
    {
        if (stream.CanSeek)
            stream.Position = 0;

        var request = new PutObjectRequest
        {
            BucketName = _bucketName,
            Key = objectName,
            InputStream = stream,
            ContentType = GetContentType(objectName)
        };

        await _s3Client.PutObjectAsync(request);
        return $"https://{_bucketName}.s3.amazonaws.com/{objectName}";
    }


    public Task<GetObjectMetadataResponse> GetObjectMetadata(string objectName)
    {
        var request = new GetObjectMetadataRequest
        {
            BucketName = _bucketName,
            Key = objectName
        };

        return _s3Client.GetObjectMetadataAsync(request);
    }

    private static string GetContentType(string fileName)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();

        return extension switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".bmp" => "image/bmp",
            ".pdf" => "application/pdf",
            ".json" => "application/json",
            ".txt" => "text/plain",
            ".mp3" => "audio/mpeg",
            ".wav" => "audio/wav",
            ".mp4" => "video/mp4",
            _ => "application/octet-stream"
        };
    }
}