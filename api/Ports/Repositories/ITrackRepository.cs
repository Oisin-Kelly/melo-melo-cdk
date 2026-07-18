using Domain;
using Ports.Services;

namespace Ports.Repositories;

public interface ITrackRepository
{
    public Task<Track?> GetTrackAsync(string trackId);
    public Task<PaginatedResult<TrackSummary>> GetTracksByUsername(string username, int pageSize, string? cursor);
    public Task CreateTrackAsync(string trackId, ProcessTrackInput input, AudioProcessingResult audio,
        ImageProcessingResult? image);
    public Task<List<string>> GetOwnedTrackIdsAsync(string ownerUsername, IReadOnlyList<string> trackIds);
    public Task<Track?> UpdateTrackAsync(string ownerUsername, string trackId, string name, string? genre,
        string? description, ImageProcessingResult? image, bool clearImage);
    public Task DeleteTrackAsync(string ownerUsername, string trackId);
}