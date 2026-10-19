using Adapters.Validation;
using Domain;

namespace Adapters.Tests.Validation;

public class PlaylistValidationServiceTests
{
    private readonly PlaylistValidationService _service = new();

    [Fact]
    public void Create_SanitisesInPlace()
    {
        var validated = _service.ValidateCreate(new CreatePlaylistRequest { Name = " Late  night\n", Description = "  " });

        validated.Name.Should().Be("Late night");
        validated.Description.Should().BeNull();
    }

    [Theory]
    [InlineData(" ")]
    [InlineData(null)]
    public void Create_RequiresAName(string? name)
    {
        FluentActions.Invoking(() => _service.ValidateCreate(new CreatePlaylistRequest { Name = name })).Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Create_NameLimitIs100Inclusive()
    {
        _service.ValidateCreate(new CreatePlaylistRequest { Name = new string('n', 100) });
        var ex = FluentActions.Invoking(() =>
            _service.ValidateCreate(new CreatePlaylistRequest { Name = new string('n', 101) })).Should().Throw<ArgumentException>().Which;
        // NotEmpty + MaximumLength share one message; it must appear once, not twice
        ex.Message.Should().Be("name is required and must be at most 100 characters");
    }

    [Fact]
    public void Description_IsCappedAt1000_OnCreateAndUpdate()
    {
        _service.ValidateCreate(new CreatePlaylistRequest { Name = "Mix", Description = new string('d', 1000) });
        FluentActions.Invoking(() =>
            _service.ValidateCreate(new CreatePlaylistRequest { Name = "Mix", Description = new string('d', 1001) })).Should().Throw<ArgumentException>();
        FluentActions.Invoking(() =>
            _service.ValidateUpdate(new UpdatePlaylistRequest { Description = new string('d', 1001) })).Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Update_NameIsOptional_ButStillCapped()
    {
        _service.ValidateUpdate(new UpdatePlaylistRequest { Description = "only the description changes" });
        FluentActions.Invoking(() => _service.ValidateUpdate(new UpdatePlaylistRequest { Name = new string('n', 101) })).Should().Throw<ArgumentException>();
    }
}
