using System.Net.Http.Headers;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using LunaAI.PC.Core.Models;

namespace LunaAI.PC.Core.Ai;

/// <summary>
/// Streaming chat provider for OpenAI-compatible HTTP endpoints.
///
/// This class only performs network I/O. It has no reference to any computer
/// capability, so a remote model cannot act on this computer through it.
/// </summary>
public sealed class OpenAiCompatibleProvider : IChatProvider, IDisposable
{
    private readonly HttpClient _httpClient;
    private readonly bool _ownsClient;
    private readonly string _baseUrl;
    private readonly string _apiKey;

    public OpenAiCompatibleProvider(string baseUrl, string apiKey, HttpClient? httpClient = null)
    {
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            throw new ArgumentException("A base URL is required for the remote provider.", nameof(baseUrl));
        }

        _baseUrl = baseUrl.TrimEnd('/');
        _apiKey = apiKey ?? string.Empty;
        _ownsClient = httpClient is null;
        _httpClient = httpClient ?? new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
    }

    public string Id => "openai-compatible";

    public string DisplayName => "Remote provider (OpenAI-compatible)";

    public bool IsDevelopmentProvider => false;

    public async IAsyncEnumerable<ChatDelta> StreamAsync(
        ChatRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        using var httpRequest = BuildRequest(request);
        using var response = await _httpClient
            .SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);

        if (!response.IsSuccessStatusCode)
        {
            var detail = await SafeReadAsync(response, cancellationToken).ConfigureAwait(false);
            throw new ProviderException($"provider_error:{response.StatusCode}:{detail}", (int)response.StatusCode);
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var reader = new StreamReader(stream, Encoding.UTF8);

        while (!reader.EndOfStream)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            if (line is null)
            {
                break;
            }

            var trimmed = line.Trim();
            if (!trimmed.StartsWith("data:", StringComparison.Ordinal))
            {
                continue;
            }

            var payload = trimmed[5..].Trim();
            if (payload.Length == 0)
            {
                continue;
            }

            if (payload == "[DONE]")
            {
                yield break;
            }

            var delta = ParseDelta(payload);
            if (delta is not null)
            {
                yield return delta;
            }
        }
    }

    internal HttpRequestMessage BuildRequest(ChatRequest request)
    {
        var body = new Dictionary<string, object?>
        {
            ["model"] = request.Model,
            ["stream"] = true,
            ["messages"] = request.Messages.Select(ToWireMessage).ToList(),
        };

        if (request.AllowToolCalls && request.Tools.Count > 0)
        {
            body["tools"] = request.Tools.Select(tool => new Dictionary<string, object?>
            {
                ["type"] = "function",
                ["function"] = new Dictionary<string, object?>
                {
                    ["name"] = tool.Name,
                    ["description"] = tool.Description,
                    ["parameters"] = JsonSerializer.Deserialize<JsonElement>(tool.ParametersJsonSchema),
                },
            }).ToList();
        }

        var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/chat/completions")
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
        };

        if (!string.IsNullOrEmpty(_apiKey))
        {
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
        }

        return httpRequest;
    }

    internal static ChatDelta? ParseDelta(string payload)
    {
        try
        {
            using var document = JsonDocument.Parse(payload);
            if (!document.RootElement.TryGetProperty("choices", out var choices) || choices.GetArrayLength() == 0)
            {
                return null;
            }

            if (!choices[0].TryGetProperty("delta", out var delta))
            {
                return null;
            }

            if (delta.TryGetProperty("tool_calls", out var toolCalls) && toolCalls.GetArrayLength() > 0)
            {
                var call = toolCalls[0];
                var id = call.TryGetProperty("id", out var idElement) ? idElement.GetString() ?? string.Empty : string.Empty;
                var function = call.TryGetProperty("function", out var functionElement) ? functionElement : default;
                var name = function.ValueKind == JsonValueKind.Object && function.TryGetProperty("name", out var nameElement)
                    ? nameElement.GetString() ?? string.Empty
                    : string.Empty;
                var arguments = function.ValueKind == JsonValueKind.Object && function.TryGetProperty("arguments", out var argsElement)
                    ? argsElement.GetString() ?? "{}"
                    : "{}";
                return ChatDelta.FromToolCall(new ToolCallRequest(id, name, arguments));
            }

            if (delta.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.String)
            {
                var text = content.GetString();
                return string.IsNullOrEmpty(text) ? null : ChatDelta.FromText(text);
            }

            return null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static object ToWireMessage(ChatMessage message) => new Dictionary<string, object?>
    {
        ["role"] = message.Role switch
        {
            ChatRole.System => "system",
            ChatRole.User => "user",
            ChatRole.Tool => "tool",
            _ => "assistant",
        },
        ["content"] = message.Content,
    };

    private static async Task<string> SafeReadAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            var text = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            return text.Length > 300 ? text[..300] : text;
        }
        catch
        {
            return string.Empty;
        }
    }

    public void Dispose()
    {
        if (_ownsClient)
        {
            _httpClient.Dispose();
        }
    }
}

public sealed class ProviderException : Exception
{
    public ProviderException(string message, int statusCode) : base(message) => StatusCode = statusCode;

    public int StatusCode { get; }
}
