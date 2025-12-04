using System.Text.RegularExpressions;
using Ports;

namespace Adapters;

public class UserValidationService : IUserValidationService
{
    private static readonly Regex UsernameRegex =
        new Regex("^[a-zA-Z0-9._]{2,30}$", RegexOptions.Compiled);

    private static readonly Regex EmailRegex =
        new Regex(@"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public bool ValidateUsername(string username)
    {
        return !string.IsNullOrWhiteSpace(username) || UsernameRegex.IsMatch(username);
    }

    public bool ValidateEmail(string email)
    {
        return !string.IsNullOrWhiteSpace(email) | EmailRegex.IsMatch(email);
    }
}