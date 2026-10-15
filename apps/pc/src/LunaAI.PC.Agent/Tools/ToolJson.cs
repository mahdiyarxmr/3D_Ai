using System.Text.Json;

namespace LunaAI.PC.Agent.Tools;

internal static class ToolJson
{
    public static string RequiredString(JsonElement arguments, string name)
    {
        if (arguments.ValueKind != JsonValueKind.Object ||
            !arguments.TryGetProperty(name, out var value) ||
            value.ValueKind != JsonValueKind.String)
        {
            throw new ArgumentException($"argument_required:{name}");
        }

        var text = value.GetString();
        if (string.IsNullOrWhiteSpace(text))
        {
            throw new ArgumentException($"argument_required:{name}");
        }

        return text!;
    }

    public static string? OptionalString(JsonElement arguments, string name) =>
        arguments.ValueKind == JsonValueKind.Object &&
        arguments.TryGetProperty(name, out var value) &&
        value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    public static bool OptionalBool(JsonElement arguments, string name, bool fallback) =>
        arguments.ValueKind == JsonValueKind.Object &&
        arguments.TryGetProperty(name, out var value) &&
        value.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? value.GetBoolean()
            : fallback;

    public static int OptionalInt(JsonElement arguments, string name, int fallback) =>
        arguments.ValueKind == JsonValueKind.Object &&
        arguments.TryGetProperty(name, out var value) &&
        value.ValueKind == JsonValueKind.Number &&
        value.TryGetInt32(out var number)
            ? number
            : fallback;

    public static string Schema(string properties, string required)
    {
        var requiredPart = string.IsNullOrEmpty(required) ? string.Empty : $", \"required\": [{required}]";
        return "{\"type\": \"object\", \"properties\": {" + properties + "}, \"additionalProperties\": false" + requiredPart + "}";
    }

    public static string StringProperty(string description) =>
        $"{{\"type\": \"string\", \"description\": \"{description}\"}}";
}
