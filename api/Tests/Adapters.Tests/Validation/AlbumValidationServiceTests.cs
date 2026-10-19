using Adapters.Validation;
using Domain;
using NSubstitute;
using Ports.Repositories;

namespace Adapters.Tests.Validation;

public class AlbumValidationServiceTests
{
    private readonly ITrackRepository _tracks = Substitute.For<ITrackRepository>();
    private AlbumValidationService Service => new(_tracks);

    private static List<string> Ids(int count) => Enumerable.Range(0, count).Select(i => $"t{i}").ToList();

    // --- Create ---

    [Fact]
    public void Create_SanitisesAndNormalisesTrackIds()
    {
        var request = new CreateAlbumRequest { Name = " EP  one ", Description = " notes ", TrackIds = ["ABC", "abc", "Def"] };

        var validated = Service.ValidateCreate(request);

        (validated.Name, validated.Description).Should().Be(("EP one", "notes"));
        validated.TrackIds.Should().Equal("abc", "def");
    }

    [Fact]
    public void Create_CapsTheTracklistAt50()
    {
        Service.ValidateCreate(new CreateAlbumRequest { Name = "Full", TrackIds = Ids(AlbumValidationService.MaxTracksPerAlbum) });
        FluentActions.Invoking(() =>
            Service.ValidateCreate(new CreateAlbumRequest { Name = "Box set", TrackIds = Ids(AlbumValidationService.MaxTracksPerAlbum + 1) })).Should().Throw<ArgumentException>();
    }

    [Theory]
    [InlineData("  \n ")]
    [InlineData(null)]
    public void Create_RequiresAName(string? name)
    {
        FluentActions.Invoking(() => Service.ValidateCreate(new CreateAlbumRequest { Name = name })).Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Create_EnforcesNameAndDescriptionLimits()
    {
        Service.ValidateCreate(new CreateAlbumRequest { Name = new string('n', 100), Description = new string('d', 1000) });
        FluentActions.Invoking(() => Service.ValidateCreate(new CreateAlbumRequest { Name = new string('n', 101) })).Should().Throw<ArgumentException>();
        FluentActions.Invoking(() =>
            Service.ValidateCreate(new CreateAlbumRequest { Name = "ok", Description = new string('d', 1001) })).Should().Throw<ArgumentException>();
    }

    // --- Update / share ---

    [Fact]
    public void Update_NameIsOptional_ButStillCapped()
    {
        Service.ValidateUpdate(new UpdateAlbumRequest { Description = "only this" });
        FluentActions.Invoking(() => Service.ValidateUpdate(new UpdateAlbumRequest { Name = new string('n', 101) })).Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Share_NeedsAddOrRemove_AndCapsTheCaption()
    {
        FluentActions.Invoking(() => Service.ValidateShare(new ShareAlbumRequest())).Should().Throw<ArgumentException>();
        FluentActions.Invoking(() =>
            Service.ValidateShare(new ShareAlbumRequest { Add = ["bob"], Caption = new string('c', 301) })).Should().Throw<ArgumentException>();
        Service.ValidateShare(new ShareAlbumRequest { Add = ["bob"], Caption = "  " }).Caption.Should().BeNull();
    }

    // --- Set tracks (ownership) ---

    [Fact]
    public async Task SetTracks_AcceptsOnlyTheOwnersTracks_AndNamesTheRest()
    {
        _tracks.GetOwnedTrackIdsAsync("alice", Arg.Any<IReadOnlyList<string>>())
            .Returns(["mine"]);

        var ex = (await FluentActions.Awaiting(() =>
            Service.ValidateSetTracksAsync("alice", new SetAlbumTracksRequest { TrackIds = ["MINE", "theirs"] })).Should().ThrowAsync<ArgumentException>()).Which;

        ex.Message.Should().Contain("theirs");
        ex.Message.Should().NotContain("mine");
    }

    [Fact]
    public async Task SetTracks_NormalisesIds_AndPassesWhenAllOwned()
    {
        _tracks.GetOwnedTrackIdsAsync("alice", Arg.Any<IReadOnlyList<string>>())
            .Returns(call => call.Arg<IReadOnlyList<string>>().ToList());

        var validated = await Service.ValidateSetTracksAsync("alice", new SetAlbumTracksRequest { TrackIds = ["B", "a", "b"] });

        validated.TrackIds.Should().Equal("b", "a");
    }

    [Fact]
    public async Task SetTracks_EmptyListIsValid_OverTheCapIsNot()
    {
        _tracks.GetOwnedTrackIdsAsync("alice", Arg.Any<IReadOnlyList<string>>())
            .Returns(call => call.Arg<IReadOnlyList<string>>().ToList());

        await Service.ValidateSetTracksAsync("alice", new SetAlbumTracksRequest());
        await FluentActions.Awaiting(() =>
            Service.ValidateSetTracksAsync("alice", new SetAlbumTracksRequest { TrackIds = Ids(51) })).Should().ThrowAsync<ArgumentException>();
        await _tracks.DidNotReceive().GetOwnedTrackIdsAsync("alice", Arg.Is<IReadOnlyList<string>>(l => l.Count == 51));
    }
}
