using Domain;

namespace Ports.Events;

/// Reacts to one change in the table (TableEventsLambda feeds it the stream, in order per
/// item). Must be safe to run twice on the same change: the stream delivers at least once.
public interface ITableChangeHandler
{
    Task HandleAsync(TableChange change);
}
