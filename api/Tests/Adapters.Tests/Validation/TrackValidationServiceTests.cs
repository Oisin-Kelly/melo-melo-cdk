using System.Net;
using Adapters.Validation;
using Amazon.S3;
using Amazon.S3.Model;
using Domain;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Ports.Services;

namespace Adapters.Tests.Validation;

public class TrackValidationServiceTests
{
    private readonly IS3Service _dropbox = Substitute.For<IS3Service>();
    private TrackValidationService Service => new(_dropbox);

    private static GetObjectMetadataResponse MetadataOfSize(long bytes)
    {
        var metadata = new GetObjectMetadataResponse();
        metadata.Headers.ContentLength = bytes;
        return metadata;
    }

    private static ProcessTrackInput Upload(Action<ProcessTrackInput>? configure = null)
    {
        var input = new ProcessTrackInput { Username = "alice", Name = "Song", AudioKey = "alice/a.wav" };
        configure?.Invoke(input);
        return input;
    }

    // --- Staged audio (HeadObject) ---

    [Fact]
    public async Task UploadedAudio_OutsideCallersPrefix_IsRejectedWithoutTouchingS3()
    {
        var ex = (await FluentActions.Awaiting(() =>
            Service.ValidateUploadedAudioAsync("bob/song.wav", "alice")).Should().ThrowAsync<ArgumentException>()).Which;

        ex.Message.Should().Contain("only use files you uploaded");
        await _dropbox.DidNotReceiveWithAnyArgs().GetObjectMetadata(default!);
    }

    [Fact]
    public async Task UploadedAudio_Missing_IsAUserSafe400()
    {
        _dropbox.GetObjectMetadata("alice/song.wav")
            .ThrowsAsync(new AmazonS3Exception("not found") { StatusCode = HttpStatusCode.NotFound });

        var ex = (await FluentActions.Awaiting(() =>
            Service.ValidateUploadedAudioAsync("alice/song.wav", "alice")).Should().ThrowAsync<ArgumentException>()).Which;
        ex.Message.Should().Contain("No uploaded audio found");
    }

    [Fact]
    public async Task UploadedAudio_OtherS3Failures_AreNotDisguisedAs400s()
    {
        _dropbox.GetObjectMetadata("alice/song.wav")
            .ThrowsAsync(new AmazonS3Exception("denied") { StatusCode = HttpStatusCode.Forbidden });

        await FluentActions.Awaiting(() => Service.ValidateUploadedAudioAsync("alice/song.wav", "alice")).Should().ThrowAsync<AmazonS3Exception>();
    }

    [Theory]
    [InlineData(300L * 1024 * 1024, true)]
    [InlineData(300L * 1024 * 1024 + 1, false)]
    public async Task UploadedAudio_SizeCapIs300MbInclusive(long bytes, bool ok)
    {
        _dropbox.GetObjectMetadata("alice/a.wav").Returns(MetadataOfSize(bytes));

        var validate = () => Service.ValidateUploadedAudioAsync("alice/a.wav", "alice");
        if (ok) await validate();
        else await validate.Should().ThrowAsync<ArgumentException>().WithMessage("*300 MB*");
    }

    // --- Upload request ---

    [Fact]
    public async Task Upload_SanitisesInPlace()
    {
        var input = Upload(i =>
        {
            i.Name = "  My   song\n";
            i.Genre = " lo  fi ";
            i.Description = "line one\n\n\n\nline two";
            i.Caption = "   ";
        });

        await Service.ValidateAsync(input);

        (input.Name, input.Genre).Should().Be(("My song", "lo fi"));
        input.Description.Should().Be($"line one{Environment.NewLine}{Environment.NewLine}line two");
        input.Caption.Should().BeNull();
    }

    public static TheoryData<string, Action<ProcessTrackInput>> InvalidUploads => new()
    {
        { "missing name", i => i.Name = "   " },
        { "name over 100", i => i.Name = new string('x', 101) },
        { "missing audioKey", i => i.AudioKey = "" },
        { "genre over 35", i => i.Genre = new string('g', 36) },
        { "description over 4000", i => i.Description = new string('d', 4001) },
        { "caption over 300", i => i.Caption = new string('c', 301) },
        { "more than 50 recipients", i => i.SharedWith = Enumerable.Range(0, 51).Select(n => $"user{n}").ToList() },
    };

    [Theory]
    [MemberData(nameof(InvalidUploads))]
    public async Task Upload_RejectsInvalidFields(string _, Action<ProcessTrackInput> breakIt)
    {
        await FluentActions.Awaiting(() => Service.ValidateAsync(Upload(breakIt))).Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task Upload_AtEveryLimit_Passes()
    {
        var input = Upload(i =>
        {
            i.Name = new string('x', 100);
            i.Genre = new string('g', 35);
            i.Description = new string('d', 4000);
            i.Caption = new string('c', 300);
            i.SharedWith = Enumerable.Range(0, 50).Select(n => $"user{n}").ToList();
        });

        await Service.ValidateAsync(input);
    }

    // --- Update ---

    [Fact]
    public void Update_RequiresAName_AndSanitises()
    {
        var request = new UpdateTrackRequest { Name = " New  name ", Genre = "  ", Description = " notes " };
        var validated = Service.ValidateUpdate(request);
        (validated.Name, validated.Genre, validated.Description).Should().Be(("New name", null, "notes"));

        var ex = FluentActions.Invoking(() => Service.ValidateUpdate(new UpdateTrackRequest { Name = "\n" })).Should().Throw<ArgumentException>().Which;
        ex.Message.Should().Contain("name is required");
    }

    [Fact]
    public void Update_EnforcesFieldLimits()
    {
        FluentActions.Invoking(() =>
            Service.ValidateUpdate(new UpdateTrackRequest { Name = "ok", Genre = new string('g', 36) })).Should().Throw<ArgumentException>();
        FluentActions.Invoking(() =>
            Service.ValidateUpdate(new UpdateTrackRequest { Name = "ok", Description = new string('d', 4001) })).Should().Throw<ArgumentException>();
    }

    // --- Share ---

    [Fact]
    public void Share_CaptionLimitAppliesAfterSanitising()
    {
        // 300 visible characters padded with whitespace still fits once trimmed
        var padded = new ShareTrackRequest { Add = ["bob"], Caption = $"   {new string('c', 300)}   " };
        Service.ValidateShare(padded).Caption!.Length.Should().Be(300);

        var over = new ShareTrackRequest { Add = ["bob"], Caption = new string('c', 301) };
        FluentActions.Invoking(() => Service.ValidateShare(over)).Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Share_NeedsSomethingToAddOrRemove_RemoveAloneIsFine()
    {
        FluentActions.Invoking(() => Service.ValidateShare(new ShareTrackRequest())).Should().Throw<ArgumentException>();
        Service.ValidateShare(new ShareTrackRequest { Remove = ["bob"] });
    }
}
