using System.Text.RegularExpressions;
using Ports;

namespace Adapters;

public class UserValidationService : IUserValidationService
{
    private readonly IUserPoolService _userPoolService;

    private static readonly Regex UsernameRegex =
        new Regex("^[a-zA-Z0-9._]{2,30}$", RegexOptions.Compiled);

    private static readonly Regex EmailRegex =
        new Regex(@"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public UserValidationService(IUserPoolService userPoolService)
    {
        _userPoolService = userPoolService;
    }

    public void ValidateUsername(string username)
    {
        var isValid = !string.IsNullOrWhiteSpace(username) || UsernameRegex.IsMatch(username);
        if (!isValid)
            throw new Exception("Username is invalid");
    }

    public async Task ValidateEmail(string email)
    {
        var isValid = !string.IsNullOrWhiteSpace(email) || EmailRegex.IsMatch(email);
        if (!isValid)
            throw new Exception("Email is invalid");

        var userInUserPool = await _userPoolService.EmailExistsInUserPool(email);

        if (userInUserPool)
            throw new Exception("Email is already in use");
    }
}