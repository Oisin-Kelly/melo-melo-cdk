using Domain;
using Lambda.Tests.Support;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Ports.Repositories;
using Ports.Services;

namespace Lambda.Tests.Handlers;

// The Step Functions-invoked processor: plain input record in, output record out. It must always
// leave the upload status COMPLETE or FAILED (with a user-safe reason), and rethrow on failure so
// the execution itself is marked failed.
public class ProcessTrackHandlerTests
{
    private readonly ITrackRepository _tracks = Substitute.For<ITrackRepository>();
    private readonly IAudioService _audio = Substitute.For<IAudioService>();
    private readonly IImageService _images = Substitute.For<IImageService>();
    private readonly IUploadStatusRepository _uploads = Substitute.For<IUploadStatusRepository>();
    private readonly TestLambdaContext _context = new();

    private ProcessTrackLambda.Function Handler => new(_tracks, _audio, _images, _uploads);

    private static ProcessTrackInput Input(string? imageKey = null) => new()
    {
        Username = "alice",
        TrackId = "t1",
        Name = "Song",
        AudioKey = "alice/a.wav",
        ImageKey = imageKey,
        SharedWith = ["bob"],
    };

    [Fact]
    public async Task Success_EncodesWritesTheTrackAndMarksComplete()
    {
        var audio = new AudioProcessingResult(245);
        _audio.ProcessAudioAsync("alice/a.wav", "t1").Returns(audio);

        var output = await Handler.FunctionHandler(Input(), _context);

        (output.TrackId, output.Success).Should().Be(("t1", true));
        Received.InOrder(() =>
        {
            _tracks.CreateTrackAsync("t1", Arg.Any<ProcessTrackInput>(), audio, null);
            _uploads.MarkCompleteAsync("alice", "t1");
        });
        await _images.DidNotReceiveWithAnyArgs().ProcessImageAsync(default!, default!, default!, default, default);
    }

    [Fact]
    public async Task WithACover_ProcessesItToTheTracksCoverKey_AsTheUploader()
    {
        var image = new ImageProcessingResult("#000000", "https://cdn/c.jpg");
        _audio.ProcessAudioAsync("alice/a.wav", "t1").Returns(new AudioProcessingResult(60));
        _images.ProcessImageAsync("alice", "alice/cover.png", "tracks/t1/cover_400x400.jpg", 400, 400).Returns(image);

        await Handler.FunctionHandler(Input("alice/cover.png"), _context);

        await _tracks.Received(1).CreateTrackAsync("t1", Arg.Any<ProcessTrackInput>(), Arg.Any<AudioProcessingResult>(), image);
    }

    [Fact]
    public async Task UserSafeFailure_IsRecordedVerbatim_AndRethrown()
    {
        _audio.ProcessAudioAsync("alice/a.wav", "t1")
            .ThrowsAsync(new ArgumentException("Audio is longer than the 24 hour limit."));

        await FluentActions.Awaiting(() => Handler.FunctionHandler(Input(), _context))
            .Should().ThrowAsync<ArgumentException>();

        await _uploads.Received(1).MarkFailedAsync("alice", "t1", "Audio is longer than the 24 hour limit.");
        await _tracks.DidNotReceiveWithAnyArgs().CreateTrackAsync(default!, default!, default!, default);
        await _uploads.DidNotReceiveWithAnyArgs().MarkCompleteAsync(default!, default!);
    }

    [Fact]
    public async Task InternalFailure_IsRecordedGenerically_SoFfmpegOutputNeverReachesClients()
    {
        _audio.ProcessAudioAsync("alice/a.wav", "t1")
            .ThrowsAsync(new InvalidOperationException("ffmpeg exited 1: Invalid data found when processing input"));

        await FluentActions.Awaiting(() => Handler.FunctionHandler(Input(), _context))
            .Should().ThrowAsync<InvalidOperationException>();

        await _uploads.Received(1).MarkFailedAsync("alice", "t1", "Audio processing failed.");
        _context.TestLogger.Lines.Should().Contain(l => l.Contains("ffmpeg exited 1")); // still logged for us
    }

    [Fact]
    public async Task ACoverFromAnotherUser_FailsTheUpload_WithTheOwnershipReason()
    {
        _audio.ProcessAudioAsync("alice/a.wav", "t1").Returns(new AudioProcessingResult(60));
        _images.ProcessImageAsync("alice", "bob/cover.png", Arg.Any<string>(), 400, 400)
            .ThrowsAsync(new ArgumentException("You can only use files you uploaded."));

        await FluentActions.Awaiting(() => Handler.FunctionHandler(Input("bob/cover.png"), _context))
            .Should().ThrowAsync<ArgumentException>();

        await _uploads.Received(1).MarkFailedAsync("alice", "t1", "You can only use files you uploaded.");
    }
}
