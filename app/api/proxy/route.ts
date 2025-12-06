export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return Response.json(
      { error: 'Missing url parameter' },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'FinBoard/1.0',
      },
    });

    const contentType = response.headers.get('content-type');
    let data;

    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else if (contentType?.includes('text')) {
      data = await response.text();
    } else {
      data = await response.arrayBuffer();
    }

    return Response.json(
      {
        ok: response.ok,
        status: response.status,
        data,
      },
      {
        status: response.status,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to fetch',
      },
      { status: 500 }
    );
  }
}