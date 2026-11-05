using System.Net;
using Adapters.Services;
using Amazon.S3;
using Amazon.S3.Model;
using Domain;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Ports.Services;

namespace Adapters.Tests.Services;

public class AudioServiceTests
{
    private readonly IS3Service _dropbox = Substitute.For<IS3Service>();
    private readonly IS3Service _private = Substitute.For<IS3Service>();
    private AudioService Service => new(_dropbox, _private);

    [Fact]
    public async Task OriginalDownload_PresignsTheArchivedOriginal_AsAnAttachmentNamedAfterTheTrack()
    {
        var metadata = new GetObjectMetadataResponse();
        metadata.Headers.ContentType = "audio/wav";
        _private.GetObjectMetadata("processed/t1/original").Returns(metadata);
        _private.GetPresignedDownloadUrlAsync(default!, default, default!).ReturnsForAnyArgs("https://s3/signed");

        var download = await Service.GetOriginalDownloadAsync("t1", "My Song", TimeSpan.FromMinutes(5));

        download.Should().Be(new OriginalDownload("https://s3/signed", "My Song.wav", "audio/wav"));
        await _private.Received(1).GetPresignedDownloadUrlAsync(
            "processed/t1/original", TimeSpan.FromMinutes(5), OriginalDownloads.ContentDisposition("My Song.wav"));
        await _dropbox.DidNotReceiveWithAnyArgs().GetObjectMetadata(default!);
    }

    [Fact]
    public async Task OriginalDownload_IsNull_WhenTheTrackHasNoArchivedOriginal()
    {
        _private.GetObjectMetadata("processed/t1/original")
            .Throws(new AmazonS3Exception("Not Found") { StatusCode = HttpStatusCode.NotFound });

        var download = await Service.GetOriginalDownloadAsync("t1", "My Song", TimeSpan.FromMinutes(5));

        download.Should().BeNull();
        await _private.DidNotReceiveWithAnyArgs().GetPresignedDownloadUrlAsync(default!, default, default!);
    }

    [Fact]
    public async Task Preview_LongTrackWithAClip_PresignsTheClip()
    {
        _private.GetPresignedGetUrlAsync("processed/t1/preview.m4a", TimeSpan.FromMinutes(10)).Returns("https://s3/clip");

        var preview = await Service.GetPreviewAsync(new LinkItemTrack("t1", "Song", 31), TimeSpan.FromMinutes(10));

        preview.Should().BeEquivalentTo(new LinkPreviewAudio { Url = "https://s3/clip", IsFullTrack = false });
    }

    [Fact]
    public async Task Preview_TrackOf30sOrLess_PlaysTheWholeTrack()
    {
        _private.GetPresignedGetUrlAsync("processed/t1/audio.m4a", TimeSpan.FromMinutes(10)).Returns("https://s3/full");

        var preview = await Service.GetPreviewAsync(new LinkItemTrack("t1", "Jingle", 30), TimeSpan.FromMinutes(10));

        preview.Should().BeEquivalentTo(new LinkPreviewAudio { Url = "https://s3/full", IsFullTrack = true });
    }

    [Fact]
    public async Task Delete_RemovesTheAudioOriginalAndClip()
    {
        await Service.DeleteAudioAsync("t1");

        await _private.Received(1).DeleteObjectAsync("processed/t1/audio.m4a");
        await _private.Received(1).DeleteObjectAsync("processed/t1/original");
        await _private.Received(1).DeleteObjectAsync("processed/t1/preview.m4a");
    }

    [Fact]
    public async Task OriginalDownload_OtherS3Failures_AreNotHiddenAsMissing()
    {
        _private.GetObjectMetadata("processed/t1/original")
            .Throws(new AmazonS3Exception("Slow Down") { StatusCode = HttpStatusCode.ServiceUnavailable });

        var act = () => Service.GetOriginalDownloadAsync("t1", "My Song", TimeSpan.FromMinutes(5));

        await act.Should().ThrowAsync<AmazonS3Exception>();
    }
}
