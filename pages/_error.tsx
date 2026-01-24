import { NextPageContext } from 'next';

interface ErrorProps {
  statusCode: number;
}

function Error({ statusCode }: ErrorProps) {
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>{statusCode || 'Error'}</h1>
      <p>
        {statusCode === 404
          ? 'This page could not be found.'
          : 'An error occurred on the server.'}
      </p>
    </div>
  );
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? (err as any).statusCode : 404;
  return { statusCode };
};

export default Error;

